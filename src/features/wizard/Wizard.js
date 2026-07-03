import { createDefaultProject } from '../../domain/project/defaultProject.js';
import { createBuildingEditor } from '../buildings/BuildingEditor.js';
import { createLocationEditor } from '../location/LocationEditor.js';
import { createElement } from '../../ui/createElement.js';

const STEP_LABELS = ['地点', '建筑', '观察区', '采光界面', '模拟'];

export function createWizard({ onClose, onProjectChange }) {
  const project = createDefaultProject();
  let step = 0;
  const content = createElement('div', { className: 'wizard-content' });
  const next = createElement('button', {
    className: 'button button--primary',
    text: '下一步',
    attributes: { type: 'button', 'data-primary-control': '' }
  });
  const back = createElement('button', {
    className: 'button button--secondary',
    text: '上一步',
    attributes: { type: 'button' }
  });
  const progress = createElement('ol', { className: 'wizard-progress' });

  function renderProgress() {
    progress.replaceChildren(
      ...STEP_LABELS.map((label, index) =>
        createElement(
          'li',
          { className: index === step ? 'is-current' : index < step ? 'is-done' : '' },
          createElement('span', { text: String(index + 1) }),
          createElement('small', { text: label })
        )
      )
    );
  }

  function render() {
    renderProgress();
    back.disabled = step === 0;
    next.textContent = step === STEP_LABELS.length - 1 ? '进入模拟' : '下一步';
    if (step === 0) {
      content.replaceChildren(createLocationEditor(project.location, location => {
        project.location = location;
        onProjectChange(project);
      }));
    } else if (step === 1) {
      content.replaceChildren(createBuildingEditor(buildings => {
        project.buildings = buildings;
        onProjectChange(project);
      }));
    } else {
      content.replaceChildren(
        createElement(
          'section',
          { className: 'wizard-section wizard-placeholder' },
          createElement('p', { className: 'wizard-kicker', text: `STEP ${step + 1}` }),
          createElement('h2', { className: 'wizard-heading', text: STEP_LABELS[step] }),
          createElement('p', { className: 'wizard-copy', text: '这一步将在接下来的编辑任务中接入真实场景。' })
        )
      );
    }
  }

  next.addEventListener('click', () => {
    if (step === STEP_LABELS.length - 1) {
      project.view.wizardComplete = true;
      onProjectChange(project);
      onClose();
      return;
    }
    step += 1;
    render();
  });
  back.addEventListener('click', () => {
    if (step > 0) {
      step -= 1;
      render();
    }
  });

  const close = createElement('button', {
    className: 'wizard-close',
    text: '关闭',
    attributes: { type: 'button', 'aria-label': '关闭新建项目向导' }
  });
  close.addEventListener('click', onClose);

  const dialog = createElement(
    'div',
    {
      className: 'wizard',
      attributes: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'wizard-title'
      }
    },
    createElement(
      'header',
      { className: 'wizard-header' },
      createElement(
        'div',
        {},
        createElement('p', { className: 'wizard-brand', text: 'SUNLIGHT PROJECT' }),
        createElement('h1', { className: 'wizard-title', text: '新建采光项目', attributes: { id: 'wizard-title' } })
      ),
      close
    ),
    progress,
    content,
    createElement('footer', { className: 'wizard-footer' }, back, next)
  );
  render();

  return createElement('div', { className: 'wizard-backdrop' }, dialog);
}
