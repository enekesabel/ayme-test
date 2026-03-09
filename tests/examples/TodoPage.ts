import { PageObject, PageComponent } from '../../src/playwright/pom';

/**
 * A reusable checkbox component.
 */
export class Checkbox extends PageComponent {
  isChecked = this.State(() => this.locators.root.isChecked());

  toggle = this.Action(() => this.root.click())
    .effect(this.isChecked, (current, previous) => current === !previous);

  check = this.Action(async () => {
    if (!(await this.isChecked())) await this.toggle();
  }).effect(this.isChecked, true);

  uncheck = this.Action(async () => {
    if (await this.isChecked()) await this.toggle();
  }).effect(this.isChecked, false);
}

/**
 * Input component for adding new TODO items.
 */
export class NewTodoInput extends PageComponent {
  getValue = this.State(() => this.locators.root.inputValue());
  isEmpty = this.State(async () => (await this.getValue()) === '');

  addTodo = this.Action(async (text: string) => {
    await this.root.fill(text);
    await this.root.press('Enter');
  }).effect(this.isEmpty, true);
}

/**
 * Represents a single TODO item in the list.
 */
export class TodoItem extends PageComponent {
  locators = this.Locators({
    label: this.root.locator('label'),
    destroyButton: this.root.locator('.destroy'),
    editInput: this.root.locator('.edit'),
    checkbox: this.root.locator('.toggle'),
  });

  checkbox = new Checkbox(this.locators.checkbox);

  getText = this.State(() => this.locators.label.innerText());
  isCompleted = this.State(() => this.checkbox.isChecked());

  toggle = this.Action(async () => {
    await this.checkbox.toggle();
  }).effect(this.isCompleted, (cur, prev) => cur === !prev);

  markAsCompleted = this.Action(async () => {
    await this.checkbox.check();
  }).effect(this.isCompleted, true);

  markAsActive = this.Action(async () => {
    await this.checkbox.uncheck();
  }).effect(this.isCompleted, false);

  async delete() {
    await this.locators.root.hover();
    await this.locators.destroyButton.click();
  }

  edit = this.Action(async (newText: string) => {
    await this.locators.label.dblclick();
    await this.locators.editInput.fill(newText);
    await this.locators.editInput.press('Enter');
  }).effect((effect, newText) => effect(this.getText, newText));
}

export class TodoPage extends PageObject {
  locators = this.Locators({
    clearCompletedButton: this.page.locator('.clear-completed'),
    itemsLeftCounter: this.page.locator('.todo-count'),
    filterAllLink: this.page.locator('.filters a', { hasText: 'All' }),
    filterActiveLink: this.page.locator('.filters a', { hasText: 'Active' }),
    filterCompletedLink: this.page.locator('.filters a', { hasText: 'Completed' }),
    newTodoInput: this.page.locator('.new-todo'),
    todoListItems: this.page.locator('.todo-list li'),
    toggleAll: this.page.locator('.toggle-all'),
  });

  newTodoInput = new NewTodoInput(this.locators.newTodoInput);
  items = this.Collection(TodoItem, this.locators.todoListItems);
  toggleAllCheckbox = new Checkbox(this.locators.toggleAll);

  itemCount = this.State(() => this.items.count());
  completedCount = this.State(() => this.items.filter({ isCompleted: true }).count());
  activeCount = this.State(() => this.items.filter({ isCompleted: false }).count());
  itemsLeftText = this.State(() => this.locators.itemsLeftCounter.innerText());
  isClearCompletedVisible = this.State(() => this.locators.clearCompletedButton.isVisible());
  activeFilter = this.State(async (): Promise<string> => {
    const url = this.page.url();
    if (url.includes('#/active')) return 'active';
    if (url.includes('#/completed')) return 'completed';
    return 'all';
  });

  goto = this.Action(async () => {
    await this.page.goto('https://demo.playwright.dev/todomvc/#/');
  }).effect(this.activeFilter, 'all');

  addTodo = this.Action(async (text: string) => {
    await this.newTodoInput.addTodo(text);
  }).effect(this.itemCount, (cur, prev) => cur === prev + 1);

  addTodos = this.Action(async (texts: string[]) => {
    for (const text of texts) {
      await this.addTodo(text);
    }
  });

  toggleAll = this.Action(async () => {
    await this.toggleAllCheckbox.toggle();
  });

  clearCompleted = this.Action(async () => {
    await this.locators.clearCompletedButton.click();
  }).effect(this.completedCount, 0);

  filterAll = this.Action(async () => {
    await this.locators.filterAllLink.click();
  }).effect(this.activeFilter, 'all');

  filterActive = this.Action(async () => {
    await this.locators.filterActiveLink.click();
    await this.page.waitForURL(/.*#\/active/);
  }).effect(this.activeFilter, 'active');

  filterCompleted = this.Action(async () => {
    await this.locators.filterCompletedLink.click();
    await this.page.waitForURL(/.*#\/completed/);
  }).effect(this.activeFilter, 'completed');
}
