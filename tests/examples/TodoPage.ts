import { PageObject, PageComponent } from '../../src/playwright/pom';

/**
 * A reusable checkbox component.
 */
export class Checkbox extends PageComponent {
  isChecked = this.State(() => this.rootLocator.isChecked());

  toggle = this.Action(
    () => this.rootLocator.click(),
    this.Effect(this.isChecked, (cur, prev) => cur === !prev)
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
 */
export class TodoItem extends PageComponent {
  checkbox = new Checkbox(this.rootLocator.locator('.toggle'));
  label = this.rootLocator.locator('label');
  destroyButton = this.rootLocator.locator('.destroy');
  editInput = this.rootLocator.locator('.edit');

  getText = this.State(() => this.label.innerText());
  isCompleted = this.State(() => this.checkbox.isChecked());

  toggle = this.Action(
    () => this.checkbox.toggle(),
    this.Effect(this.isCompleted, (cur, prev) => cur === !prev)
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
    await this.destroyButton.click();
  }

  edit = this.Action((newText: string) => ({
    execute: async () => {
      await this.label.dblclick();
      await this.editInput.fill(newText);
      await this.editInput.press('Enter');
    },
    effects: this.Effect(this.getText, newText),
  }));
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

  goto = this.Action(
    () => this.page.goto('https://demo.playwright.dev/todomvc/#/'),
    this.Effect(this.activeFilter, 'all')
  );

  addTodo = this.Action(
    async (text: string) => {
      await this.newTodoInput.addTodo(text);
      const startTime = Date.now();
      while (Date.now() - startTime < 5000) {
        const item = await this.findTodoByText(text);
        if (item !== undefined) return;
        await new Promise(r => setTimeout(r, 100));
      }
    },
    this.Effect(this.itemCount, (cur, prev) => cur === prev + 1)
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
    () => this.clearCompletedButton.click(),
    this.Effect(this.completedCount, 0)
  );

  filterAll = this.Action(
    () => this.filterAllLink.click(),
    this.Effect(this.activeFilter, 'all')
  );

  filterActive = this.Action(
    async () => {
      await this.filterActiveLink.click();
      await this.page.waitForURL(/.*#\/active/);
    },
    this.Effect(this.activeFilter, 'active')
  );

  filterCompleted = this.Action(
    async () => {
      await this.filterCompletedLink.click();
      await this.page.waitForURL(/.*#\/completed/);
    },
    this.Effect(this.activeFilter, 'completed')
  );

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
