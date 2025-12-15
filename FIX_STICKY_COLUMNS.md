# Исправление фиксации столбцов в диаграмме Ганта

## Проблема
Тоглы в первой строке диаграммы Ганта не работают - столбцы не фиксируются при включении тогла.

## Причина
Селекторы в функции `updateStickyColumns()` используют неправильные классы. Вместо `.start-col`, `.end-col`, `.days-col` нужно использовать `.gantt-details-cell.start-col`, `.gantt-details-cell.end-col`, `.gantt-details-cell.days-col`.

## Решение

Откройте файл `implementation_schedule.html` и найдите функцию `updateStickyColumns()` (примерно строка 10033).

### Исправление 1: Массив allSelectors

Найдите строки:
```javascript
            const allSelectors = [
                '.gantt-header-label',
                '.gantt-label',
                '.start-col',
                '.end-col',
                '.days-col',
                '.link-cell',
                '.responsible-cell'
            ];
```

Замените на:
```javascript
            const allSelectors = [
                '.gantt-header-label',
                '.gantt-label',
                '.gantt-details-cell.start-col',
                '.gantt-details-cell.end-col',
                '.gantt-details-cell.days-col',
                '.gantt-details-cell.link-cell',
                '.gantt-details-cell.responsible-cell'
            ];
```

### Исправление 2: Массив columns

Найдите строки:
```javascript
            const columns = [
                { key: 'label', selector: '.gantt-header-label, .gantt-label', width: labelWidth, visible: stickyColumns.has('label') },
                { key: 'start', selector: '.start-col', width: startWidth, visible: stickyColumns.has('start') },
                { key: 'end', selector: '.end-col', width: endWidth, visible: stickyColumns.has('end') },
                { key: 'days', selector: '.days-col', width: daysWidth, visible: stickyColumns.has('days') },
                { key: 'link', selector: '.link-cell', width: linkWidth, visible: stickyColumns.has('link') && document.body.classList.contains('show-link') },
                { key: 'responsible', selector: '.responsible-cell', width: respWidth, visible: stickyColumns.has('responsible') && document.body.classList.contains('show-responsible') },
            ];
```

Замените на:
```javascript
            const columns = [
                { key: 'label', selector: '.gantt-header-label, .gantt-label', width: labelWidth, visible: stickyColumns.has('label') },
                { key: 'start', selector: '.gantt-details-cell.start-col', width: startWidth, visible: stickyColumns.has('start') },
                { key: 'end', selector: '.gantt-details-cell.end-col', width: endWidth, visible: stickyColumns.has('end') },
                { key: 'days', selector: '.gantt-details-cell.days-col', width: daysWidth, visible: stickyColumns.has('days') },
                { key: 'link', selector: '.gantt-details-cell.link-cell', width: linkWidth, visible: stickyColumns.has('link') && document.body.classList.contains('show-link') },
                { key: 'responsible', selector: '.gantt-details-cell.responsible-cell', width: respWidth, visible: stickyColumns.has('responsible') && document.body.classList.contains('show-responsible') },
            ];
```

## После исправления

1. Сохраните файл
2. Обновите страницу в браузере (F5 или Ctrl+R)
3. Проверьте работу тоглов - столбцы должны фиксироваться при включении

## Альтернативный способ (через PowerShell)

Если файл не открыт в редакторе, можно выполнить команду в PowerShell:

```powershell
cd "c:\Users\Driga_VA\Academy_SetlSoft\1"
$content = Get-Content implementation_schedule.html -Raw -Encoding UTF8
$content = $content -replace "'.start-col',","'.gantt-details-cell.start-col',"
$content = $content -replace "'.end-col',","'.gantt-details-cell.end-col',"
$content = $content -replace "'.days-col',","'.gantt-details-cell.days-col',"
$content = $content -replace "selector: '.start-col'","selector: '.gantt-details-cell.start-col'"
$content = $content -replace "selector: '.end-col'","selector: '.gantt-details-cell.end-col'"
$content = $content -replace "selector: '.days-col'","selector: '.gantt-details-cell.days-col'"
$content = $content -replace "selector: '.link-cell'","selector: '.gantt-details-cell.link-cell'"
$content = $content -replace "selector: '.responsible-cell'","selector: '.gantt-details-cell.responsible-cell'"
Set-Content implementation_schedule.html -Value $content -Encoding UTF8 -NoNewline
```



