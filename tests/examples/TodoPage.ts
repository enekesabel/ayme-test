import { Action, PageObject, PageComponent } from '../../src/playwright/pom';

/**
 * A reusable checkbox component.
 */
export class Checkbox extends PageComponent {
  isChecked = this.State(() => this.locators.root.isChecked());

  @Action
  async toggle() {
    const before = await this.isChecked();
    await this.locators.root.click();
    await this.waitFor(this.isChecked, cur => cur === !before);
  }

  @Action
  async check() {
    if (!(await this.isChecked())) await this.toggle();
    await this.waitFor(this.isChecked, true);
  }

  @Action
  async uncheck() {
    if (await this.isChecked()) await this.toggle();
    await this.waitFor(this.isChecked, false);
  }
}

/**
 * Input component for adding new TODO items.
 */
export class NewTodoInput extends PageComponent {
  getValue = this.State(() => this.locators.root.inputValue());
  isEmpty = this.State(async () => (await this.getValue()) === '');

  @Action
  async addTodo(text: string) {
    await this.locators.root.fill(text);
    await this.locators.root.press('Enter');
    await this.waitFor(this.isEmpty, true);
  }
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

  @Action
  async toggle() {
    const before = await this.isCompleted();
    await this.checkbox.toggle();
    await this.waitFor(this.isCompleted, cur => cur === !before);
  }

  @Action
  async markAsCompleted() {
    await this.checkbox.check();
    await this.waitFor(this.isCompleted, true);
  }

  @Action
  async markAsActive() {
    await this.checkbox.uncheck();
    await this.waitFor(this.isCompleted, false);
  }

  async delete() {
    await this.locators.root.hover();
    await this.locators.destroyButton.click();
  }

  @Action
  async edit(newText: string) {
    await this.locators.label.dblclick();
    await this.locators.editInput.fill(newText);
    await this.locators.editInput.press('Enter');
    await this.waitFor(this.getText, newText);
  }
}

/**
 * Represents the TodoMVC page.
 */
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

  @Action
  async goto() {
    await this.page.goto('https://demo.playwright.dev/todomvc/#/');
    await this.waitFor(this.activeFilter, 'all');
  }

  @Action
  async addTodo(text: string) {
    const beforeCount = await this.itemCount();
    await this.newTodoInput.addTodo(text);
    await this.waitFor(this.itemCount, cur => cur === beforeCount + 1);
  }

  async addTodos(texts: string[]) {
    for (const text of texts) {
      await this.addTodo(text);
    }
  }

  async toggleAll() {
    await this.toggleAllCheckbox.toggle();
  }

  @Action
  async clearCompleted() {
    await this.locators.clearCompletedButton.click();
    await this.waitFor(this.completedCount, 0);
  }

  @Action
  async filterAll() {
    await this.locators.filterAllLink.click();
    await this.waitFor(this.activeFilter, 'all');
  }

  @Action
  async filterActive() {
    await this.locators.filterActiveLink.click();
    await this.page.waitForURL(/.*#\/active/);
    await this.waitFor(this.activeFilter, 'active');
  }

  @Action
  async filterCompleted() {
    await this.locators.filterCompletedLink.click();
    await this.page.waitForURL(/.*#\/completed/);
    await this.waitFor(this.activeFilter, 'completed');
  }

  async getTodoAt(index: number): Promise<TodoItem | undefined> {
    return this.items.at(index);
  }

  async findTodoByText(text: string): Promise<TodoItem | undefined> {
    return this.items.find({ getText: text });
  }

  async getCompletedItems(): Promise<TodoItem[]> {
    return this.items.filter({ isCompleted: true }).all();
  }

  async getActiveItems(): Promise<TodoItem[]> {
    return this.items.filter({ isCompleted: false }).all();
  }
}
