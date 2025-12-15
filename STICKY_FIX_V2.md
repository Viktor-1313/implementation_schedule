# Исправление фиксации столбцов - Версия 2

## Проблема
Функция заменена, но столбцы все еще не фиксируются.

## Возможные причины

### 1. Родительский контейнер блокирует sticky

Проверьте в консоли браузера (F12):
```javascript
const chart = document.getElementById('ganttChart');
const container = chart.closest('.chart-container');
const style = getComputedStyle(container);
console.log('overflow-x:', style.overflowX);
console.log('overflow-y:', style.overflowY);
```

**Если `overflow-x` или `overflow-y` = `visible`**, это блокирует sticky!

**Решение:** Найдите в CSS определение `.chart-container` и убедитесь, что там:
```css
.chart-container {
    overflow-x: auto;  /* НЕ visible! */
    overflow-y: auto;  /* НЕ visible! */
}
```

### 2. Элементы не находятся

Проверьте в консоли:
```javascript
const chart = document.getElementById('ganttChart');
console.log('Найдено .gantt-label:', chart.querySelectorAll('.gantt-label').length);
console.log('Найдено .gantt-details-cell.start-col:', chart.querySelectorAll('.gantt-details-cell.start-col').length);
```

Если количество = 0, значит элементы не созданы или селекторы неправильные.

### 3. Функция вызывается до создания элементов

Проверьте, что функция вызывается ПОСЛЕ `renderGantt()`. 

Найдите в коде все вызовы `updateStickyColumns()` и убедитесь, что они идут после `renderGantt()`.

### 4. CSS блокирует sticky

Проверьте, нет ли в CSS правил, которые переопределяют `position: sticky`:

```javascript
const chart = document.getElementById('ganttChart');
const label = chart.querySelector('.gantt-label');
if (label) {
    const style = getComputedStyle(label);
    console.log('position:', style.position);
    console.log('left:', style.left);
}
```

Если `position` не `sticky`, значит что-то переопределяет стили.

## Быстрая проверка

Выполните в консоли браузера на странице с диаграммой:

```javascript
// 1. Проверка элементов
const chart = document.getElementById('ganttChart');
console.log('Элементы .gantt-label:', chart.querySelectorAll('.gantt-label').length);
console.log('Элементы .gantt-details-cell.start-col:', chart.querySelectorAll('.gantt-details-cell.start-col').length);

// 2. Проверка родительского контейнера
const container = chart.closest('.chart-container');
if (container) {
    const style = getComputedStyle(container);
    console.log('overflow-x:', style.overflowX);
    console.log('overflow-y:', style.overflowY);
}

// 3. Проверка stickyColumns
console.log('stickyColumns:', typeof stickyColumns !== 'undefined' ? Array.from(stickyColumns) : 'не определена');

// 4. Вызов функции вручную
if (typeof updateStickyColumns === 'function') {
    updateStickyColumns();
    setTimeout(() => {
        const label = chart.querySelector('.gantt-label');
        if (label) {
            const style = getComputedStyle(label);
            console.log('После вызова - position:', style.position, 'left:', style.left);
        }
    }, 100);
}
```

## Исправление CSS (если нужно)

Если `.chart-container` имеет `overflow: visible`, найдите определение (примерно строка 2338) и замените:

**Было:**
```css
.chart-container {
    ...
    overflow-x: visible;
    overflow-y: visible;
    ...
}
```

**Должно быть:**
```css
.chart-container {
    ...
    overflow-x: auto;
    overflow-y: auto;
    ...
}
```

## Проверка в медиа-запросах

Также проверьте медиа-запросы. Найдите все места, где определяется `.chart-container` в `@media` блоках и убедитесь, что там тоже `overflow-x: auto` или `overflow-x: scroll`, но НЕ `overflow: hidden` или `overflow: visible`.



