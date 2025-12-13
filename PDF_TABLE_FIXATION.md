# Фиксация таблиц на странице PDF

## Проблема
Таблицы смещаются при изменении количества листов, не остаются в фиксированной позиции на странице.

## Решение: Вариант 1 - Фиксированная высота секции с Flexbox (РЕКОМЕНДУЕТСЯ)

Использовать flexbox для создания фиксированной структуры страницы, где таблица всегда начинается с одной и той же позиции.

### Изменения в функции `createPageSection`:

```javascript
const createPageSection = (isFirst = false) => {
    const section = document.createElement('div');
    section.className = 'pdf-page-section';
    section.style.width = '100%';
    section.style.height = '297mm'; // Фиксированная высота страницы A3 landscape
    section.style.minHeight = '297mm';
    section.style.maxHeight = '297mm';
    section.style.padding = '0';
    section.style.paddingLeft = '5mm';
    section.style.paddingRight = '5mm';
    section.style.margin = '0';
    section.style.background = '#ffffff';
    section.style.pageBreakInside = 'avoid';
    section.style.breakInside = 'avoid';
    section.style.pageBreakAfter = 'always';
    section.style.breakAfter = 'page';
    section.style.boxSizing = 'border-box';
    section.style.display = 'flex'; // ИСПОЛЬЗУЕМ FLEXBOX
    section.style.flexDirection = 'column'; // Вертикальное расположение
    section.style.overflow = 'hidden'; // Скрываем переполнение
    
    if (!isFirst) {
        section.style.pageBreakBefore = 'always';
        section.style.breakBefore = 'page';
    }
    
    // Добавляем шапку с фиксированной высотой
    const header = createHeader(isFirst);
    header.style.margin = '0';
    header.style.marginTop = '8mm'; // Жесткий отступ сверху страницы
    header.style.marginBottom = '3mm'; // Жесткий отступ снизу шапки
    header.style.padding = '0';
    header.style.flexShrink = '0'; // Шапка не сжимается
    header.style.height = 'auto';
    section.appendChild(header);
    
    // Создаем контейнер для контента (заголовок + таблица)
    const contentContainer = document.createElement('div');
    contentContainer.style.flex = '1'; // Занимает оставшееся пространство
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.minHeight = '0'; // Важно для корректной работы flex
    contentContainer.style.overflow = 'hidden';
    section.appendChild(contentContainer);
    
    // Сохраняем ссылку на контейнер для добавления заголовка и таблицы
    section._contentContainer = contentContainer;
    
    return section;
};
```

### Изменения при добавлении заголовка и таблицы:

```javascript
// Вместо:
section.appendChild(ganttTitle);
section.appendChild(ganttTable);

// Используем:
const contentContainer = section._contentContainer || section;

// Заголовок таблицы с фиксированным отступом
ganttTitle.style.margin = '0';
ganttTitle.style.marginBottom = '2mm'; // Жесткий отступ снизу заголовка
ganttTitle.style.padding = '0';
ganttTitle.style.flexShrink = '0'; // Заголовок не сжимается
contentContainer.appendChild(ganttTitle);

// Таблица с фиксированным отступом сверху
ganttTable.style.margin = '0';
ganttTable.style.marginBottom = '0';
ganttTable.style.padding = '0';
ganttTable.style.flex = '1'; // Таблица занимает оставшееся пространство
ganttTable.style.minHeight = '0';
ganttTable.style.overflow = 'auto'; // Прокрутка внутри таблицы, если нужно
contentContainer.appendChild(ganttTable);
```

---

## Решение: Вариант 2 - Фиксированная позиция таблицы (альтернатива)

Использовать абсолютное позиционирование с фиксированными координатами относительно секции.

### Изменения:

```javascript
const createPageSection = (isFirst = false) => {
    const section = document.createElement('div');
    section.className = 'pdf-page-section';
    section.style.width = '100%';
    section.style.height = '297mm'; // Фиксированная высота страницы
    section.style.minHeight = '297mm';
    section.style.maxHeight = '297mm';
    section.style.padding = '0';
    section.style.margin = '0';
    section.style.background = '#ffffff';
    section.style.position = 'relative'; // Для абсолютного позиционирования дочерних элементов
    section.style.pageBreakInside = 'avoid';
    section.style.breakInside = 'avoid';
    section.style.pageBreakAfter = 'always';
    section.style.breakAfter = 'page';
    section.style.boxSizing = 'border-box';
    section.style.overflow = 'hidden';
    
    if (!isFirst) {
        section.style.pageBreakBefore = 'always';
        section.style.breakBefore = 'page';
    }
    
    // Шапка с фиксированной позицией
    const header = createHeader(isFirst);
    header.style.position = 'absolute';
    header.style.top = '8mm';
    header.style.left = '5mm';
    header.style.right = '5mm';
    header.style.margin = '0';
    header.style.padding = '0';
    header.style.height = 'auto';
    section.appendChild(header);
    
    return section;
};
```

### При добавлении заголовка и таблицы:

```javascript
// Заголовок таблицы с фиксированной позицией
ganttTitle.style.position = 'absolute';
ganttTitle.style.top = '51mm'; // 8mm (отступ сверху) + 15mm (шапка) + 3mm (отступ) + 25mm (запас) = 51mm
ganttTitle.style.left = '5mm';
ganttTitle.style.right = '5mm';
ganttTitle.style.margin = '0';
ganttTitle.style.marginBottom = '2mm';
ganttTitle.style.padding = '0';
ganttTitle.style.height = 'auto';
section.appendChild(ganttTitle);

// Таблица с фиксированной позицией
ganttTable.style.position = 'absolute';
ganttTable.style.top = '55mm'; // Заголовок + отступ = 51mm + 4mm = 55mm
ganttTable.style.left = '5mm';
ganttTable.style.right = '5mm';
ganttTable.style.bottom = '5mm'; // Отступ снизу страницы
ganttTable.style.margin = '0';
ganttTable.style.padding = '0';
ganttTable.style.height = 'auto';
ganttTable.style.maxHeight = '237mm'; // 297mm - 55mm - 5mm = 237mm
ganttTable.style.overflow = 'auto';
section.appendChild(ganttTable);
```

---

## Решение: Вариант 3 - Центрирование таблицы на странице

Если нужно, чтобы таблица всегда была по центру страницы (вертикально).

### Изменения:

```javascript
const createPageSection = (isFirst = false) => {
    const section = document.createElement('div');
    section.className = 'pdf-page-section';
    section.style.width = '100%';
    section.style.height = '297mm';
    section.style.minHeight = '297mm';
    section.style.maxHeight = '297mm';
    section.style.padding = '0';
    section.style.margin = '0';
    section.style.background = '#ffffff';
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.justifyContent = 'center'; // Центрирование по вертикали
    section.style.alignItems = 'stretch';
    section.style.pageBreakInside = 'avoid';
    section.style.breakInside = 'avoid';
    section.style.pageBreakAfter = 'always';
    section.style.breakAfter = 'page';
    section.style.boxSizing = 'border-box';
    section.style.overflow = 'hidden';
    
    if (!isFirst) {
        section.style.pageBreakBefore = 'always';
        section.style.breakBefore = 'page';
    }
    
    // Шапка
    const header = createHeader(isFirst);
    header.style.margin = '0';
    header.style.marginTop = '8mm';
    header.style.marginBottom = '3mm';
    header.style.padding = '0';
    header.style.flexShrink = '0';
    section.appendChild(header);
    
    // Контейнер для таблицы (будет центрирован)
    const tableWrapper = document.createElement('div');
    tableWrapper.style.flex = '1';
    tableWrapper.style.display = 'flex';
    tableWrapper.style.flexDirection = 'column';
    tableWrapper.style.justifyContent = 'center'; // Центрирование таблицы
    tableWrapper.style.minHeight = '0';
    section.appendChild(tableWrapper);
    
    section._tableWrapper = tableWrapper;
    
    return section;
};
```

### При добавлении таблицы:

```javascript
const tableWrapper = section._tableWrapper || section;

ganttTitle.style.margin = '0';
ganttTitle.style.marginBottom = '2mm';
ganttTitle.style.padding = '0';
tableWrapper.appendChild(ganttTitle);

ganttTable.style.margin = '0';
ganttTable.style.padding = '0';
ganttTable.style.width = '100%';
tableWrapper.appendChild(ganttTable);
```

---

## Рекомендация

**Использовать Вариант 1 (Flexbox)** по следующим причинам:

1. ✅ **Надежность** - flexbox лучше работает с html2pdf.js
2. ✅ **Гибкость** - легко адаптировать под разные размеры таблиц
3. ✅ **Предсказуемость** - таблица всегда начинается с одной позиции
4. ✅ **Совместимость** - работает с текущей структурой кода
5. ✅ **Простота** - минимальные изменения в коде

### Ключевые моменты:

- Фиксированная высота секции: `297mm` (высота A3 landscape)
- Использование `flex: 1` для таблицы - она занимает оставшееся пространство
- Жесткие отступы в миллиметрах для всех элементов
- `flexShrink: 0` для шапки и заголовка - они не сжимаются
- `minHeight: 0` для flex-контейнеров - важно для корректной работы

### Расчет позиций:

- Высота страницы: `297mm`
- Отступ сверху секции: `8mm`
- Высота шапки: `~15mm` (автоматически)
- Отступ снизу шапки: `3mm`
- Отступ снизу заголовка: `2mm`
- Отступ снизу секции: `5mm`
- **Доступная высота для таблицы**: `297mm - 8mm - 15mm - 3mm - 2mm - 5mm = ~264mm`

Таблица всегда будет начинаться с позиции `8mm + 15mm + 3mm + 2mm = 28mm` от верха страницы.



