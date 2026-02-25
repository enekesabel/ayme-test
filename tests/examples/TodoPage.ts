import { Action, PageObject, PageComponent } from '../../src/playwright/pom';

/**
 * A reusable checkbox component.
 */
export class Checkbox extends PageComponent {
  isChecked = this.State(() => this.root.isChecked());

  @Action
  async toggle() {
    const before = await this.isChecked();
    await this.root.click();
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
  getValue = this.State(() => this.root.inputValue());
  isEmpty = this.State(async () => (await this.getValue()) === '');

  @Action
  async addTodo(text: string) {
    await this.root.fill(text);
    await this.root.press('Enter');
    await this.waitFor(this.isEmpty, true);
  }
}

/**
 * Represents a single TODO item in the list.
 */
export class TodoItem extends PageComponent {
  checkbox = new Checkbox(this.root.locator('.toggle'));
  label = this.root.locator('label');
  destroyButton = this.root.locator('.destroy');
  editInput = this.root.locator('.edit');

  getText = this.State(() => this.label.innerText());
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
    await this.root.hover();
    await this.destroyButton.click();
  }

  @Action
  async edit(newText: string) {
    await this.label.dblclick();
    await this.editInput.fill(newText);
    await this.editInput.press('Enter');
    await this.waitFor(this.getText, newText);
  }
}

/**
 * Represents the TodoMVC page.
 */
export class TodoPage extends PageObject {
  newTodoInput = new NewTodoInput(this.page.locator('.new-todo'));
  items = this.Collection(TodoItem, this.page.locator('.todo-list li'));
  toggleAllCheckbox = new Checkbox(this.page.locator('.toggle-all'));
  clearCompletedButton = this.page.locator('.clear-completed');
  itemsLeftCounter = this.page.locator('.todo-count');
  filterAllLink = this.page.locator('.filters a', { hasText: 'All' });
  filterActiveLink = this.page.locator('.filters a', { hasText: 'Active' });
  filterCompletedLink = this.page.locator('.filters a', { hasText: 'Completed' });

  itemCount = this.State(() => this.items.count());
  completedCount = this.State(() => this.items.filter({ isCompleted: true }).count());
  activeCount = this.State(() => this.items.filter({ isCompleted: false }).count());
  itemsLeftText = this.State(() => this.itemsLeftCounter.innerText());
  isClearCompletedVisible = this.State(() => this.clearCompletedButton.isVisible());
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
    await this.clearCompletedButton.click();
    await this.waitFor(this.completedCount, 0);
  }

  @Action
  async filterAll() {
    await this.filterAllLink.click();
    await this.waitFor(this.activeFilter, 'all');
  }

  @Action
  async filterActive() {
    await this.filterActiveLink.click();
    await this.page.waitForURL(/.*#\/active/);
    await this.waitFor(this.activeFilter, 'active');
  }

  @Action
  async filterCompleted() {
    await this.filterCompletedLink.click();
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
