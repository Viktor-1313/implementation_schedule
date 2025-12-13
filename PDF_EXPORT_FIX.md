# Исправление экспорта PDF - таблицы не выгружаются

## Проблема
При экспорте в PDF выгружается только титульный лист, таблицы не попадают в PDF.

## Причина
Таблицы находятся в контейнерах с абсолютным позиционированием (`position: absolute`), которые html2canvas не может корректно захватить.

## Решение
Нужно убрать абсолютное позиционирование и добавлять таблицы напрямую в секции, используя обычный поток документа.

## Исправленный код

В функции `exportPDF` нужно заменить:

### 1. Контейнер для таблицы диаграммы Ганта

**Было (неправильно):**
```javascript
const tableContainer = document.createElement('div');
tableContainer.style.position = 'absolute';
tableContainer.style.top = '70px';
tableContainer.style.left = '10px';
tableContainer.style.right = '10px';
tableContainer.style.bottom = '10px';
tableContainer.style.overflow = 'visible';
tableContainer.style.zIndex = '1';
```

**Должно быть (правильно):**
```javascript
// Убираем контейнер с абсолютным позиционированием
// Добавляем заголовок и таблицу напрямую в секцию
```

### 2. Добавление таблицы в секцию

**Было (неправильно):**
```javascript
tableContainer.appendChild(ganttTable);
section.appendChild(tableContainer);
```

**Должно быть (правильно):**
```javascript
// Добавляем заголовок диаграммы напрямую в секцию
const ganttTitle = document.createElement('div');
ganttTitle.textContent = `Диаграмма Ганта (${scaleLabel})`;
ganttTitle.style.fontSize = '12px';
ganttTitle.style.fontWeight = '600';
ganttTitle.style.margin = '4px 0 6px 0';
ganttTitle.style.textAlign = 'left';
section.appendChild(ganttTitle);

// Добавляем таблицу напрямую в секцию
section.appendChild(ganttTable);
```

### 3. Контейнер для детальной таблицы

**Было (неправильно):**
```javascript
const detailTableContainer = document.createElement('div');
detailTableContainer.style.position = 'absolute';
detailTableContainer.style.top = '70px';
detailTableContainer.style.left = '10px';
detailTableContainer.style.right = '10px';
detailTableContainer.style.bottom = '10px';
```

**Должно быть (правильно):**
```javascript
// Убираем контейнер с абсолютным позиционированием
// Добавляем заголовок и таблицу напрямую в секцию
const detailTitle = document.createElement('div');
detailTitle.textContent = 'Детальная таблица задач';
detailTitle.style.fontSize = '12px';
detailTitle.style.fontWeight = '600';
detailTitle.style.margin = '4px 0 6px 0';
detailTitle.style.textAlign = 'left';
detailSection.appendChild(detailTitle);

// Добавляем таблицу напрямую в секцию
detailSection.appendChild(detailTable);
```

### 4. Функция createPageSection

**Было (неправильно):**
```javascript
section.style.height = '210mm';
section.style.minHeight = '210mm';
section.style.maxHeight = '210mm';
```

**Должно быть (правильно):**
```javascript
section.style.padding = '10px';
section.style.paddingBottom = '20px';
// Убираем фиксированную высоту, используем min-height
section.style.minHeight = '210mm';
```

### 5. Шапка секции

**Было (неправильно):**
```javascript
const headerEl = createHeader(isFirst);
headerEl.style.position = 'absolute';
headerEl.style.top = '10px';
headerEl.style.left = '10px';
headerEl.style.right = '100px';
headerEl.style.zIndex = '5';
section.appendChild(headerEl);
```

**Должно быть (правильно):**
```javascript
// Добавляем шапку в обычный поток документа
section.appendChild(createHeader(isFirst));
```

## Полный пример исправленной функции

Смотрите файл `implementation_schedule1.html` строки 12962-13800 для полного примера исправленной функции `exportPDF`.

## Важно

После исправления:
1. Таблицы будут добавляться напрямую в секции
2. html2canvas сможет корректно захватить все элементы
3. PDF будет содержать титульный лист, диаграммы Ганта и детальную таблицу задач





