import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

const QUESTION_TYPES = [
  { type: 'text', label: 'Short Answer', icon: 'Tt', description: 'A single-line text response' },
  { type: 'paragraph', label: 'Paragraph', icon: '☰', description: 'A longer written response' },
  { type: 'rating', label: 'Rating', icon: '★', description: 'A numbered performance rating' },
  { type: 'number', label: 'Number', icon: '123', description: 'A numeric response' },
  { type: 'radio', label: 'Radio Buttons', icon: '◉', description: 'Choose one option' },
  { type: 'checkbox', label: 'Checkboxes', icon: '☑', description: 'Choose multiple options' },
  { type: 'dropdown', label: 'Dropdown', icon: '⌄', description: 'Choose one option from a menu' },
  { type: 'yesno', label: 'Yes or No', icon: 'Y/N', description: 'A simple yes-or-no response' },
  { type: 'date', label: 'Date', icon: '▣', description: 'Select a calendar date' },
  { type: 'section', label: 'Section Header', icon: 'H', description: 'Organize the form into sections' },
  { type: 'instructions', label: 'Instructions', icon: 'i', description: 'Add explanatory text' },
  { type: 'divider', label: 'Divider', icon: '—', description: 'Add a visual separator' },
];

let builder = null;

function fieldId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadBuilderData(templateId = '') {
  const workflowSnapshot = await getDocs(collection(db, 'performanceWorkflows'));
  const workflows = workflowSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  let template = null;
  if (templateId) {
    const snapshot = await getDoc(doc(db, 'performanceTemplates', templateId));
    if (snapshot.exists()) template = { id: snapshot.id, ...snapshot.data() };
  }
  return { workflows, template };
}

function closeBuilder() {
  document.getElementById('performanceBuilderModal')?.remove();
  builder = null;
}

function builderShell(data) {
  document.getElementById('performanceBuilderModal')?.remove();
  const template = data.template;
  builder = {
    data,
    fields: structuredClone(template?.fields || []),
    editingIndex: null,
  };

  const workflowOptions = data.workflows.map(item => `<option value="${item.id}" ${template?.workflowId === item.id ? 'selected' : ''}>${esc(item.title || item.id)}</option>`).join('');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="performance-builder-backdrop" id="performanceBuilderModal">
      <section class="performance-builder-modal">
        <header class="performance-builder-head">
          <div><p>PERFORMANCE CENTER</p><h2>${template ? 'Edit review template' : 'Create review template'}</h2></div>
          <button type="button" class="performance-builder-close" aria-label="Close">×</button>
        </header>
        <div class="performance-builder-meta">
          <label>Template title<input id="builderTitle" value="${esc(template?.title || '')}" placeholder="Quarterly Performance Review" required></label>
          <label>Category<input id="builderCategory" value="${esc(template?.category || 'Performance Review')}" required></label>
          <label>Workflow<select id="builderWorkflow" required><option value="">Select workflow</option>${workflowOptions}</select></label>
          <label>Status<select id="builderStatus"><option ${template?.status === 'DRAFT' ? 'selected' : ''}>DRAFT</option><option ${template?.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option><option ${template?.status === 'ARCHIVED' ? 'selected' : ''}>ARCHIVED</option></select></label>
          <label class="full">Description<textarea id="builderDescription" placeholder="Describe when and how this template should be used.">${esc(template?.description || '')}</textarea></label>
        </div>
        <div class="performance-builder-layout">
          <main class="performance-builder-canvas">
            <div class="performance-builder-section-title"><div><p>FORM FIELDS</p><h3>Build your review form</h3><span>Add, edit, duplicate, delete, or drag questions to reorder them.</span></div></div>
            <div id="builderQuestionList" class="performance-builder-question-list"></div>
            <button type="button" id="builderAddQuestion" class="performance-builder-add">＋ Add question</button>
            <footer class="performance-builder-summary"><span id="builderQuestionCount"></span><span id="builderWeightTotal"></span></footer>
          </main>
          <aside class="performance-builder-sidebar">
            <p>ADD QUESTION</p><h3>Choose a question type</h3><span>Select a type to add it to the form.</span>
            <div class="performance-builder-type-list">${QUESTION_TYPES.map(type => typeButton(type)).join('')}</div>
          </aside>
        </div>
        <div class="performance-builder-actions">
          <button type="button" class="performance-btn" id="builderCancel">Cancel</button>
          <button type="button" class="performance-btn primary" id="builderSave">Save Form</button>
        </div>
      </section>
    </div>`);

  document.querySelector('.performance-builder-close').onclick = closeBuilder;
  document.getElementById('builderCancel').onclick = closeBuilder;
  document.getElementById('builderAddQuestion').onclick = () => showTypeChooser();
  document.querySelectorAll('[data-builder-type]').forEach(button => button.onclick = () => editQuestion({ type: button.dataset.builderType }));
  document.getElementById('builderSave').onclick = saveTemplate;
  renderQuestions();
}

function typeButton(type) {
  return `<button type="button" data-builder-type="${type.type}" class="performance-builder-type"><i>${esc(type.icon)}</i><span><strong>${esc(type.label)}</strong><small>${esc(type.description)}</small></span><b>›</b></button>`;
}

function typeDefinition(type) {
  return QUESTION_TYPES.find(item => item.type === type) || QUESTION_TYPES[0];
}

function normalizeField(field) {
  const type = field.type === 'choice' ? 'radio' : field.type;
  return {
    id: field.id || fieldId(),
    type,
    label: field.label || '',
    description: field.description || '',
    placeholder: field.placeholder || '',
    required: Boolean(field.required),
    weight: Number(field.weight || 0),
    options: Array.isArray(field.options) ? field.options : [],
    min: field.min ?? 0,
    max: field.max ?? (type === 'rating' ? 5 : 100),
  };
}

function renderQuestions() {
  builder.fields = builder.fields.map(normalizeField);
  const list = document.getElementById('builderQuestionList');
  if (!list) return;
  list.innerHTML = builder.fields.map((field, index) => questionCard(field, index)).join('') || '<div class="performance-builder-empty">No questions yet. Select a type or click “Add question.”</div>';
  document.getElementById('builderQuestionCount').textContent = `${builder.fields.length} question${builder.fields.length === 1 ? '' : 's'}`;
  document.getElementById('builderWeightTotal').textContent = `Total weight: ${builder.fields.reduce((sum, field) => sum + Number(field.weight || 0), 0)}`;

  list.querySelectorAll('[data-edit-question]').forEach(button => button.onclick = () => editQuestion(builder.fields[Number(button.dataset.editQuestion)], Number(button.dataset.editQuestion)));
  list.querySelectorAll('[data-delete-question]').forEach(button => button.onclick = () => {
    builder.fields.splice(Number(button.dataset.deleteQuestion), 1);
    renderQuestions();
  });
  list.querySelectorAll('[data-duplicate-question]').forEach(button => button.onclick = () => {
    const index = Number(button.dataset.duplicateQuestion);
    builder.fields.splice(index + 1, 0, { ...structuredClone(builder.fields[index]), id: fieldId(), label: `${builder.fields[index].label} (Copy)` });
    renderQuestions();
  });

  list.querySelectorAll('.performance-builder-question').forEach(card => {
    card.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', card.dataset.index);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', event => event.preventDefault());
    card.addEventListener('drop', event => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain'));
      const to = Number(card.dataset.index);
      if (from === to || Number.isNaN(from) || Number.isNaN(to)) return;
      const [moved] = builder.fields.splice(from, 1);
      builder.fields.splice(to, 0, moved);
      renderQuestions();
    });
  });
}

function questionCard(field, index) {
  const definition = typeDefinition(field.type);
  const displayOnly = ['section', 'instructions', 'divider'].includes(field.type);
  return `<article class="performance-builder-question" draggable="true" data-index="${index}">
    <div class="performance-builder-drag" title="Drag to reorder">⋮⋮</div>
    <div class="performance-builder-number">${index + 1}</div>
    <div class="performance-builder-question-icon">${esc(definition.icon)}</div>
    <div class="performance-builder-question-body">
      <small>${esc(definition.label)}</small>
      ${field.type === 'divider' ? '<hr>' : `<h4>${esc(field.label || definition.label)}${field.required && !displayOnly ? ' <em>*</em>' : ''}</h4>`}
      ${field.description ? `<p>${esc(field.description)}</p>` : ''}
      ${previewField(field)}
    </div>
    <div class="performance-builder-question-meta">${field.required && !displayOnly ? '<span>Required</span>' : ''}${field.weight ? `<span>Weight: ${field.weight}</span>` : ''}</div>
    <div class="performance-builder-question-actions">
      <button type="button" data-edit-question="${index}" title="Edit">✎</button>
      <button type="button" data-duplicate-question="${index}" title="Duplicate">▣</button>
      <button type="button" data-delete-question="${index}" title="Delete">⌫</button>
    </div>
  </article>`;
}

function previewField(field) {
  const options = field.type === 'yesno' ? ['Yes', 'No'] : field.options;
  if (field.type === 'paragraph') return `<textarea disabled placeholder="${esc(field.placeholder || 'Enter a detailed response…')}"></textarea>`;
  if (field.type === 'rating') return `<div class="performance-builder-stars">${Array.from({ length: Math.min(10, Number(field.max || 5)) }, () => '★').join('')}</div>`;
  if (field.type === 'radio') return `<div class="performance-builder-options">${options.map(option => `<span>○ ${esc(option)}</span>`).join('')}</div>`;
  if (field.type === 'checkbox') return `<div class="performance-builder-options">${options.map(option => `<span>□ ${esc(option)}</span>`).join('')}</div>`;
  if (field.type === 'dropdown') return `<select disabled><option>${esc(field.placeholder || 'Select an option')}</option></select>`;
  if (field.type === 'yesno') return '<div class="performance-builder-options"><span>○ Yes</span><span>○ No</span></div>';
  if (field.type === 'date') return '<input disabled type="date">';
  if (field.type === 'number') return `<input disabled type="number" placeholder="${esc(field.placeholder || 'Enter a number')}">`;
  if (field.type === 'text') return `<input disabled placeholder="${esc(field.placeholder || 'Enter a response…')}">`;
  if (field.type === 'instructions') return `<div class="performance-builder-instructions">${esc(field.description || field.label || 'Instructions')}</div>`;
  return '';
}

function showTypeChooser() {
  document.getElementById('performanceQuestionModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="performance-question-backdrop" id="performanceQuestionModal"><section class="performance-question-modal"><header><div><p>ADD QUESTION</p><h3>Choose a question type</h3></div><button type="button" id="closeQuestionChooser">×</button></header><div class="performance-question-types">${QUESTION_TYPES.map(type => typeButton(type)).join('')}</div></section></div>`);
  document.getElementById('closeQuestionChooser').onclick = () => document.getElementById('performanceQuestionModal')?.remove();
  document.querySelectorAll('#performanceQuestionModal [data-builder-type]').forEach(button => button.onclick = () => {
    document.getElementById('performanceQuestionModal')?.remove();
    editQuestion({ type: button.dataset.builderType });
  });
}

function editQuestion(existing, index = null) {
  const field = normalizeField(existing || { type: 'text' });
  const definition = typeDefinition(field.type);
  const needsOptions = ['radio', 'checkbox', 'dropdown'].includes(field.type);
  const displayOnly = ['section', 'instructions', 'divider'].includes(field.type);
  document.getElementById('performanceQuestionModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="performance-question-backdrop" id="performanceQuestionModal"><section class="performance-question-modal editor"><header><div><p>${index === null ? 'ADD QUESTION' : 'EDIT QUESTION'}</p><h3>${esc(definition.label)}</h3></div><button type="button" id="closeQuestionEditor">×</button></header><form id="performanceQuestionForm">
    ${field.type === 'divider' ? '<p class="performance-question-help">This adds a visual divider. No response is collected.</p>' : `<label>${displayOnly ? (field.type === 'section' ? 'Section title' : 'Text heading') : 'Question'}<input name="label" value="${esc(field.label)}" required placeholder="${esc(definition.label)}"></label>`}
    ${field.type !== 'divider' ? `<label>Description <small>(optional)</small><textarea name="description" placeholder="Add instructions or context">${esc(field.description)}</textarea></label>` : ''}
    ${!displayOnly && !['radio','checkbox','yesno','date'].includes(field.type) ? `<label>Placeholder <small>(optional)</small><input name="placeholder" value="${esc(field.placeholder)}"></label>` : ''}
    ${needsOptions ? `<label>Answer choices <small>One option per line</small><textarea name="options" required placeholder="Option 1\nOption 2\nOption 3">${esc(field.options.join('\n'))}</textarea></label>` : ''}
    ${field.type === 'rating' ? `<div class="performance-question-row"><label>Minimum<input name="min" type="number" value="${Number(field.min ?? 1)}"></label><label>Maximum<input name="max" type="number" min="2" max="10" value="${Number(field.max || 5)}"></label></div>` : ''}
    ${field.type === 'number' ? `<div class="performance-question-row"><label>Minimum<input name="min" type="number" value="${Number(field.min ?? 0)}"></label><label>Maximum<input name="max" type="number" value="${Number(field.max ?? 100)}"></label></div>` : ''}
    ${!displayOnly ? `<div class="performance-question-row"><label>Weight<input name="weight" type="number" min="0" value="${Number(field.weight || 0)}"></label><label class="performance-question-check"><input name="required" type="checkbox" ${field.required ? 'checked' : ''}> Required response</label></div>` : ''}
    <div class="performance-question-actions"><button type="button" class="performance-btn" id="cancelQuestionEditor">Cancel</button><button type="submit" class="performance-btn primary">${index === null ? 'Add Question' : 'Save Question'}</button></div>
  </form></section></div>`);

  const close = () => document.getElementById('performanceQuestionModal')?.remove();
  document.getElementById('closeQuestionEditor').onclick = close;
  document.getElementById('cancelQuestionEditor').onclick = close;
  document.getElementById('performanceQuestionForm').onsubmit = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const options = needsOptions ? String(form.get('options') || '').split('\n').map(value => value.trim()).filter(Boolean) : (field.type === 'yesno' ? ['Yes', 'No'] : []);
    if (needsOptions && options.length < 2) {
      alert('Add at least two answer choices.');
      return;
    }
    const updated = {
      ...field,
      id: field.id || fieldId(),
      label: field.type === 'divider' ? 'Divider' : String(form.get('label') || '').trim(),
      description: String(form.get('description') || '').trim(),
      placeholder: String(form.get('placeholder') || '').trim(),
      required: form.get('required') === 'on',
      weight: Number(form.get('weight') || 0),
      options,
      min: Number(form.get('min') ?? field.min ?? 0),
      max: Number(form.get('max') ?? field.max ?? 100),
    };
    if (index === null) builder.fields.push(updated); else builder.fields[index] = updated;
    close();
    renderQuestions();
  };
}

async function saveTemplate() {
  const button = document.getElementById('builderSave');
  const title = document.getElementById('builderTitle').value.trim();
  const workflowId = document.getElementById('builderWorkflow').value;
  if (!title) return alert('Enter a template title.');
  if (!workflowId) return alert('Select an approval workflow.');
  if (!builder.fields.length) return alert('Add at least one question or form element.');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const payload = {
      title,
      category: document.getElementById('builderCategory').value.trim() || 'Performance Review',
      workflowId,
      status: document.getElementById('builderStatus').value,
      description: document.getElementById('builderDescription').value.trim(),
      fields: builder.fields.map((field, index) => ({ ...normalizeField(field), order: index + 1 })),
      updatedAt: serverTimestamp(),
    };
    if (builder.data.template) await updateDoc(doc(db, 'performanceTemplates', builder.data.template.id), payload);
    else await addDoc(collection(db, 'performanceTemplates'), { ...payload, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
    closeBuilder();
    document.querySelector('[data-performance-tab="templates"]')?.click();
  } catch (error) {
    console.error(error);
    alert(`Unable to save template: ${error.code || error.message}`);
    button.disabled = false;
    button.textContent = 'Save Form';
  }
}

async function openBuilder(templateId = '') {
  try {
    builderShell(await loadBuilderData(templateId));
  } catch (error) {
    console.error(error);
    alert(`Unable to open the form builder: ${error.code || error.message}`);
  }
}

function enhanceReviewModal(modal) {
  const formFields = modal.querySelector('.performance-form-fields');
  const form = modal.querySelector('form');
  if (!formFields || !form || modal.dataset.enhancedFields) return;
  modal.dataset.enhancedFields = 'true';

  const reviewTitle = modal.querySelector('.performance-modal-head h2')?.textContent || '';
  Promise.all([
    getDocs(collection(db, 'performanceTemplates')),
    getDocs(collection(db, 'performanceReviews')),
  ]).then(([templatesSnapshot, reviewsSnapshot]) => {
    const templates = templatesSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const review = reviewsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).find(item => item.title === reviewTitle);
    const template = templates.find(item => item.id === review?.templateId);
    if (!review || !template) return;
    formFields.innerHTML = (template.fields || []).map(field => liveResponseField(normalizeField(field), review.responses?.[field.id])).join('');
    form.addEventListener('submit', () => {
      (template.fields || []).map(normalizeField).filter(field => field.type === 'checkbox').forEach(field => {
        const selected = [...form.querySelectorAll(`[data-checkbox-field="${CSS.escape(field.id)}"]:checked`)].map(input => input.value);
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = `field_${field.id}`;
        hidden.value = JSON.stringify(selected);
        form.appendChild(hidden);
      });
    }, true);
  }).catch(error => console.warn('Unable to enhance performance review fields.', error));
}

function liveResponseField(field, value = '') {
  const name = `field_${field.id}`;
  const required = field.required ? 'required' : '';
  const selectedValues = field.type === 'checkbox' ? (() => { try { return JSON.parse(value || '[]'); } catch { return []; } })() : [];
  if (field.type === 'section') return `<section class="performance-live-section"><h3>${esc(field.label)}</h3><p>${esc(field.description)}</p></section>`;
  if (field.type === 'instructions') return `<div class="performance-live-instructions"><strong>${esc(field.label)}</strong><p>${esc(field.description)}</p></div>`;
  if (field.type === 'divider') return '<hr class="performance-live-divider">';
  if (field.type === 'paragraph') return `<label class="full">${esc(field.label)}${field.required ? ' *' : ''}<small>${esc(field.description)}</small><textarea name="${name}" placeholder="${esc(field.placeholder)}" ${required}>${esc(value)}</textarea></label>`;
  if (field.type === 'rating') return `<label>${esc(field.label)}${field.required ? ' *' : ''}<small>${esc(field.description)}</small><input name="${name}" type="number" min="${field.min}" max="${field.max}" value="${esc(value)}" ${required}></label>`;
  if (field.type === 'number') return `<label>${esc(field.label)}${field.required ? ' *' : ''}<small>${esc(field.description)}</small><input name="${name}" type="number" min="${field.min}" max="${field.max}" value="${esc(value)}" placeholder="${esc(field.placeholder)}" ${required}></label>`;
  if (field.type === 'date') return `<label>${esc(field.label)}${field.required ? ' *' : ''}<small>${esc(field.description)}</small><input name="${name}" type="date" value="${esc(value)}" ${required}></label>`;
  if (field.type === 'radio' || field.type === 'yesno') return `<fieldset class="performance-live-options"><legend>${esc(field.label)}${field.required ? ' *' : ''}</legend><small>${esc(field.description)}</small>${field.options.map(option => `<label><input type="radio" name="${name}" value="${esc(option)}" ${String(value) === option ? 'checked' : ''} ${required}> ${esc(option)}</label>`).join('')}</fieldset>`;
  if (field.type === 'checkbox') return `<fieldset class="performance-live-options"><legend>${esc(field.label)}${field.required ? ' *' : ''}</legend><small>${esc(field.description)}</small>${field.options.map(option => `<label><input type="checkbox" data-checkbox-field="${esc(field.id)}" value="${esc(option)}" ${selectedValues.includes(option) ? 'checked' : ''}> ${esc(option)}</label>`).join('')}</fieldset>`;
  if (field.type === 'dropdown') return `<label>${esc(field.label)}${field.required ? ' *' : ''}<small>${esc(field.description)}</small><select name="${name}" ${required}><option value="">${esc(field.placeholder || 'Select an option')}</option>${field.options.map(option => `<option ${String(value) === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`;
  return `<label>${esc(field.label)}${field.required ? ' *' : ''}<small>${esc(field.description)}</small><input name="${name}" value="${esc(value)}" placeholder="${esc(field.placeholder)}" ${required}></label>`;
}

document.addEventListener('click', event => {
  const create = event.target.closest('#newPerformanceTemplate');
  const edit = event.target.closest('.performance-edit-template');
  if (!create && !edit) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openBuilder(edit?.dataset.id || '');
}, true);

new MutationObserver(mutations => {
  mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    const modal = node.matches?.('#performanceModal') ? node : node.querySelector?.('#performanceModal');
    if (modal) enhanceReviewModal(modal);
  }));
}).observe(document.body, { childList: true, subtree: true });
