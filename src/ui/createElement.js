export function createElement(tagName, options = {}, ...children) {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text != null) element.textContent = options.text;
  if (options.testId) element.dataset.testid = options.testId;
  if (options.attributes) {
    for (const [name, value] of Object.entries(options.attributes)) {
      element.setAttribute(name, value);
    }
  }
  for (const child of children.flat()) {
    if (child != null) element.append(child);
  }
  return element;
}
