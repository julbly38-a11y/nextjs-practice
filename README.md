# Конструктор сторінок (nextjs-practice)

Візуальний drag-and-drop конструктор веб-сторінок на Next.js + React + Tailwind CSS. Дозволяє збирати кілька сторінок сайту з блоків, заголовків, тексту та кнопок прямо в браузері, налаштовувати кожен елемент через бічну панель і експортувати результат у JSON або готовий HTML.

Увесь застосунок — це один клієнтський компонент [`AppBoundedCanvas`](app/page.tsx), що рендериться на `/` через [`app/page.tsx`](app/page.tsx).

## Демо

Проєкт задеплоєний на Vercel (проєкт `nextjs-practice`).

## Стек

- **Next.js 16** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **[react-rnd](https://github.com/bokuweb/react-rnd)** — перетягування (drag) і зміна розміру (resize) елементів на полотні

## Можливості

### Полотно та елементи
- 4 типи елементів: **Блок**, **Заголовок**, **Текст**, **Кнопка**
- Вільне перетягування та зміна розміру (`react-rnd`), прив'язка до сітки 10px (можна вимкнути)
- Вкладена ієрархія: елементи можна робити дочірніми до блоків; дочірній елемент не може стати батьком свого ж предка (захист від циклів)
- Батьківський блок не можна зменшити менше, ніж займають його дочірні елементи (`getMinDimensions`)
- Кольори рівнів вкладеності (5 кольорів по колу) + можливість задати власний колір фону/тексту для кожного елемента
- Множинне виділення (Shift/Ctrl + клік) і масове редагування спільних полів

### Сторінки
- Кілька сторінок сайту (перемикач у хедері), кожна із власною назвою
- Елемент можна зробити **глобальним** (`isGlobal`) — тоді він показується на всіх сторінках одночасно (наприклад, шапка сайту)
- Кнопка може вести на іншу сторінку (`targetPageId`) — клік перемикає активну сторінку

### Тригери появи (Hover / Click)
- Будь-який елемент можна позначити як **"схований за замовчуванням"** (`isTriggerTarget`)
- Інші елементи можуть відкривати його при наведенні (`showOnHoverId`) або кліку (`showOnClickId`) — основа для випадаючих меню, підказок, акордеонів

### Кнопки: розширені стани
- Окремий текст/фон/колір тексту для **Hover** та **Active/Pressed** станів
- Світіння (glow) при наведенні — колір і розмиття
- Режим **Toggle** — кнопка перемикається між ON/OFF і зберігає стан (`isPressed`)
- Зміна ширини/висоти та зсув по Y у натиснутому стані

### Типографіка
- Шрифт (кілька пресетів + системний), насиченість (300–900), вирівнювання тексту, розмір шрифту, padding, border-radius (для кнопок)

### Історія та збереження
- **Undo/Redo** до 30 кроків, гарячі клавіші `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`
- Автозбереження стану (сторінки + елементи) у `localStorage`:
  - `mis_canvas_elements_multipage`
  - `mis_canvas_pages_list`

### Імпорт / Експорт
- **💾 Зберегти JSON** — вивантажує весь проєкт (`{ pages, elements }`)
- **📂 Завантажити JSON** — імпортує раніше збережений проєкт (підтримує і старий формат — просто масив елементів)
- **🌐 Експорт в HTML** — генерує самодостатній статичний HTML-файл з інлайн-стилями та JS-функцією перемикання сторінок (без React і Tailwind)

## Модель даних

```ts
interface Page {
  id: string;
  name: string;
}

interface CanvasElement {
  id: number;
  pageId: string;
  isGlobal?: boolean;
  type: "block" | "heading" | "text" | "button";
  content: string;
  width: number; height: number; x: number; y: number;
  textColor: string; padding: number; borderRadius: number; fontSize: number;
  parentId: number | null;
  customBgColor?: string;

  // тригери появи
  showOnHoverId?: number | null;
  showOnClickId?: number | null;
  isTriggerTarget?: boolean;

  // типографіка
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right" | "justify";

  // навігація
  targetPageId?: string | null;

  // hover-стан кнопки
  hoverContent?: string; hoverBgColor?: string; hoverTextColor?: string;
  glowColor?: string; glowBlur?: number;

  // active/toggle-стан кнопки
  activeContent?: string; activeBgColor?: string; activeTextColor?: string;
  activeScale?: number; activeOffsetY?: number;
  activeGlowColor?: string; activeGlowBlur?: number;
  activeWidthOffset?: number; activeHeightOffset?: number;
  isToggle?: boolean; isPressed?: boolean;
}
```

## Структура проєкту

```
app/
  layout.tsx    # кореневий layout, шрифти Geist
  page.tsx      # весь конструктор (AppBoundedCanvas)
  globals.css   # Tailwind + CSS-змінні теми
public/         # статичні SVG-іконки (стандартні для create-next-app)
```

## Запуск

```bash
npm install
npm run dev
```

Відкрити [http://localhost:3000](http://localhost:3000).

Інші команди:

```bash
npm run build   # production-збірка
npm run start   # запуск production-збірки
npm run lint    # ESLint
```

## Відомі обмеження / напрямки розвитку

- Стан живе лише в `localStorage` браузера — немає бекенду чи мультикористувацького збереження
- Немає видалення окремої сторінки з підтвердженням через UI-модалку (лише `window.confirm`)
- Експорт в HTML не переносить hover/active-стани кнопок та тригери появи (тільки базовий вигляд і перехід між сторінками)
- `updateSelectedFields` типізований через `any` для значення поля — можна звузити типи
