import { Action, PageObject } from '../../../src/playwright/pom';

class TodoPage extends PageObject {
  constructor(page: any) {
    super(page);
  }

  itemCount = this.State(async () => 0);

  @Action
  async goto(): Promise<void> {
    await this.page.goto('about:blank');
    await this.waitFor(this.itemCount, n => n >= 0);
  }

  @Action('TodoPage.addTodo')
  async addTodo(text: string): Promise<number> {
    void text;
    return this.itemCount();
  }
}

async function testActionDecorator(page: TodoPage) {
  const v1: Promise<void> = page.goto();
  const v2: Promise<number> = page.addTodo('Ship');
  void v1;
  void v2;
}

export {};
