import { PageObject, PageComponent, PageElement } from '../../src/playwright/pom';

/**
 * A reusable checkbox component.
 */
export class Checkbox extends PageComponent {
  isChecked = this.State(() => this.rootLocator.isChecked());

  toggle = this.Action(
    () => this.rootLocator.click(),
    this.Effect(this.isChecked, prev => !prev())
  );

  check = this.Action(
    async () => {
      if (!(await this.isChecked())) await this.toggle();
    },
    this.Effect(this.isChecked, true)
  );

  uncheck = this.Action(
    async () => {
      if (await this.isChecked()) await this.toggle();
    },
    this.Effect(this.isChecked, false)
  );
}

/**
 * Input component for adding new TODO items.
 */
export class NewTodoInput extends PageComponent {
  getValue = this.State(() => this.rootLocator.inputValue());
  isEmpty = this.State(async () => (await this.getValue()) === '');

  addTodo = this.Action(
    async (text: string) => {
      await this.rootLocator.fill(text);
      await this.rootLocator.press('Enter');
    },
    this.Effect(this.isEmpty, true)
  );
}

/**
 * Represents a single TODO item in the list.
 * Demonstrates this.Child() for composing components.
 */
export class TodoItem extends PageComponent {
  checkbox = this.Child(Checkbox, this.rootLocator.locator('.toggle'));
  label = this.Child(PageElement, this.rootLocator.locator('label'));
  destroyButton = this.Child(PageElement, this.rootLocator.locator('.destroy'));
  editInput = this.Child(PageElement, this.rootLocator.locator('.edit'));

  getText = this.State(() => this.label.rootLocator.innerText());
  isCompleted = this.State(() => this.checkbox.isChecked());

  toggle = this.Action(
    () => this.checkbox.toggle(),
    this.Effect(this.isCompleted, prev => !prev())
  );

  markAsCompleted = this.Action(
    () => this.checkbox.check(),
    this.Effect(this.isCompleted, true)
  );

  markAsActive = this.Action(
    () => this.checkbox.uncheck(),
    this.Effect(this.isCompleted, false)
  );

  async delete() {
    await this.rootLocator.hover();
    await this.destroyButton.rootLocator.click();
  }

  edit = this.Action((newText: string) => ({
    execute: async () => {
      await this.label.rootLocator.dblclick();
      await this.editInput.rootLocator.fill(newText);
      await this.editInput.rootLocator.press('Enter');
    },
    effects: this.Effect(this.getText, newText),
  }));
}

/**
 * Represents the TodoMVC page.
 * Demonstrates this.Child() and this.ChildCollection() for composition.
 */
export class TodoPage extends PageObject {
  newTodoInput = this.Child(NewTodoInput, this.page.locator('.new-todo'));
  items = this.ChildCollection(TodoItem, this.page.locator('.todo-list li'));
  toggleAllCheckbox = this.Child(Checkbox, this.page.locator('.toggle-all'));
  clearCompletedButton = this.Child(PageElement, this.page.locator('.clear-completed'));
  itemsLeftCounter = this.Child(PageElement, this.page.locator('.todo-count'));
  filterAllLink = this.Child(PageElement, this.page.locator('.filters a', { hasText: 'All' }));
  filterActiveLink = this.Child(PageElement, this.page.locator('.filters a', { hasText: 'Active' }));
  filterCompletedLink = this.Child(PageElement, this.page.locator('.filters a', { hasText: 'Completed' }));

  itemCount = this.State(() => this.items.count());
  completedCount = this.State(() => this.items.filter({ isCompleted: true }).count());
  activeCount = this.State(() => this.items.filter({ isCompleted: false }).count());
  itemsLeftText = this.State(() => this.itemsLeftCounter.rootLocator.innerText());
  isClearCompletedVisible = this.State(() => this.clearCompletedButton.rootLocator.isVisible());
  activeFilter = this.State(async () => {
    const url = this.page.url();
    if (url.includes('#/active')) return 'active';
    if (url.includes('#/completed')) return 'completed';
    return 'all';
  });

  goto = this.Action(
    () => this.page.goto('https://demo.playwright.dev/todomvc/#/'),
    this.Effect(this.activeFilter, 'all')
  );

  addTodo = this.Action(
    async (text: string) => {
      await this.newTodoInput.addTodo(text);
      // Wait for item to appear
      const startTime = Date.now();
      while (Date.now() - startTime < 5000) {
        const item = await this.findTodoByText(text);
        if (item !== undefined) return;
        await new Promise(r => setTimeout(r, 100));
      }
    },
    this.Effect(this.itemCount, prev => prev() + 1)
  );

  async addTodos(texts: string[]) {
    for (const text of texts) {
      await this.addTodo(text);
    }
  }

  async toggleAll() {
    await this.toggleAllCheckbox.toggle();
  }

  clearCompleted = this.Action(
    () => this.clearCompletedButton.rootLocator.click(),
    this.Effect(this.completedCount, 0)
  );

  filterAll = this.Action(
    () => this.filterAllLink.rootLocator.click(),
    this.Effect(this.activeFilter, 'all')
  );

  filterActive = this.Action(
    async () => {
      await this.filterActiveLink.rootLocator.click();
      await this.page.waitForURL(/.*#\/active/);
    },
    this.Effect(this.activeFilter, 'active')
  );

  filterCompleted = this.Action(
    async () => {
      await this.filterCompletedLink.rootLocator.click();
      await this.page.waitForURL(/.*#\/completed/);
    },
    this.Effect(this.activeFilter, 'completed')
  );

  // Custom query methods
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
