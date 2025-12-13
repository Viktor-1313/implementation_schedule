# Исправление CSS - убрать position: static

## Проблема
В CSS для `.gantt-label` есть `position: static`, который переопределяет `position: sticky`, устанавливаемый функцией. Из-за этого столбцы не фиксируются.

## Решение

### Шаг 1: Откройте файл
Откройте `1/implementation_schedule.html` в редакторе.

### Шаг 2: Найдите определение `.gantt-label`
Найдите в файле (примерно строка 2971):
```css
        .gantt-label {
            min-width: 180px;
            padding: 8px 10px;
            border-right: 2px solid var(--color-border);
            background: var(--color-bg);
            font-weight: 500;
            font-size: 11px;
            position: static;      /* <-- ЭТО НУЖНО УДАЛИТЬ ИЛИ ЗАКОММЕНТИРОВАТЬ */
            left: auto;            /* <-- ЭТО ТОЖЕ НУЖНО УДАЛИТЬ */
            z-index: auto;         /* <-- ЭТО ТОЖЕ НУЖНО УДАЛИТЬ */
            box-sizing: border-box;
            overflow: visible;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
        }
```

### Шаг 3: Удалите или закомментируйте строки
Удалите или закомментируйте эти три строки:
- `position: static;`
- `left: auto;`
- `z-index: auto;`

**Должно получиться:**
```css
        .gantt-label {
            min-width: 180px;
            padding: 8px 10px;
            border-right: 2px solid var(--color-border);
            background: var(--color-bg);
            font-weight: 500;
            font-size: 11px;
            /* position, left и z-index будут устанавливаться функцией updateStickyColumns */
            box-sizing: border-box;
            overflow: visible;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
        }
```

### Шаг 4: Сохраните и проверьте
1. Сохраните файл (Ctrl+S)
2. Обновите страницу в браузере (F5)
3. Включите тогл для столбца "Задача"
4. Прокрутите диаграмму горизонтально - столбец должен фиксироваться и быть видимым!

## Альтернативный способ (через поиск и замену)

1. Откройте файл в редакторе
2. Нажмите Ctrl+H (поиск и замена)
3. Найдите: `position: static;`
4. Замените на: `/* position: static; */`
5. Повторите для `left: auto;` и `z-index: auto;`
6. Сохраните файл

## Важно

После исправления CSS функция `updateStickyColumns()` сможет правильно применять `position: sticky` через inline стили, и столбцы будут фиксироваться и быть видимыми!
