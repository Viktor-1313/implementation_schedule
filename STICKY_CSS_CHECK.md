# Проверка CSS для фиксации столбцов

## Важно: Проверьте CSS для `.chart-container`

Для правильной работы `position: sticky` родительский контейнер должен иметь `overflow` (не `visible`).

### Проверьте в файле `implementation_schedule.html`:

Найдите определение `.chart-container` (примерно строка 2338) и убедитесь, что там есть:

```css
.chart-container {
    ...
    overflow-x: auto;  /* ДОЛЖНО БЫТЬ auto или scroll, НЕ visible */
    overflow-y: auto;  /* ДОЛЖНО БЫТЬ auto или scroll, НЕ visible */
    ...
}
```

### Если там `overflow: visible`:

Замените на:
```css
.chart-container {
    ...
    overflow-x: auto;
    overflow-y: auto;
    ...
}
```

## Также проверьте `.gantt-chart`:

Убедитесь, что `.gantt-chart` НЕ имеет `overflow: hidden`, который может блокировать sticky.

Если есть `overflow: hidden` на `.gantt-chart`, уберите его или замените на `overflow: visible`.



