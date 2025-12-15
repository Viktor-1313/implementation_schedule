# Полное исправление фиксации столбцов

## Шаг 1: Диагностика в консоли браузера

Откройте страницу с диаграммой Ганта, откройте консоль (F12) и выполните:

```javascript
// Полная диагностика
function fullDiagnostic() {
    console.log('=== ПОЛНАЯ ДИАГНОСТИКА ===\n');
    
    // 1. Проверка элемента
    const chart = document.getElementById('ganttChart');
    if (!chart) {
        console.error('❌ #ganttChart не найден!');
        return;
    }
    console.log('✅ #ganttChart найден');
    
    // 2. Проверка родительского контейнера
    const container = chart.closest('.chart-container');
    if (container) {
        const style = getComputedStyle(container);
        console.log('\n📦 Родительский контейнер:');
        console.log('   overflow-x:', style.overflowX);
        console.log('   overflow-y:', style.overflowY);
        console.log('   transform:', style.transform);
        console.log('   position:', style.position);
        
        if (style.overflowX === 'visible' || style.overflowY === 'visible') {
            console.error('❌ ПРОБЛЕМА: overflow = visible блокирует sticky!');
        }
        if (style.transform !== 'none') {
            console.warn('⚠️ transform применен - может блокировать sticky');
        }
    }
    
    // 3. Проверка элементов
    console.log('\n🔍 Проверка элементов:');
    const selectors = {
        'label': '.gantt-label',
        'start': '.gantt-details-cell.start-col',
        'end': '.gantt-details-cell.end-col',
        'days': '.gantt-details-cell.days-col'
    };
    
    Object.entries(selectors).forEach(([key, selector]) => {
        const elements = chart.querySelectorAll(selector);
        console.log(`   ${key} (${selector}): ${elements.length} элементов`);
        if (elements.length > 0) {
            const el = elements[0];
            const style = getComputedStyle(el);
            console.log(`      position: ${style.position}, left: ${style.left}`);
        }
    });
    
    // 4. Проверка stickyColumns
    console.log('\n📋 Состояние stickyColumns:');
    if (typeof stickyColumns !== 'undefined') {
        console.log('   Set:', Array.from(stickyColumns));
        console.log('   Размер:', stickyColumns.size);
    } else {
        console.error('❌ stickyColumns не определена!');
    }
    
    // 5. Проверка функции
    console.log('\n⚙️ Проверка функции:');
    if (typeof updateStickyColumns === 'function') {
        console.log('✅ updateStickyColumns определена');
    } else {
        console.error('❌ updateStickyColumns не определена!');
    }
    
    // 6. Тестовый вызов
    console.log('\n🧪 Тестовый вызов функции:');
    if (typeof updateStickyColumns === 'function') {
        updateStickyColumns();
        setTimeout(() => {
            console.log('\n📊 Результат после вызова:');
            Object.entries(selectors).forEach(([key, selector]) => {
                const elements = chart.querySelectorAll(selector);
                if (elements.length > 0) {
                    const el = elements[0];
                    const style = getComputedStyle(el);
                    const isSticky = style.position === 'sticky';
                    console.log(`   ${key}: position=${style.position}, left=${style.left} ${isSticky ? '✅' : '❌'}`);
                }
            });
        }, 200);
    }
}

fullDiagnostic();
```

## Шаг 2: Исправление CSS (если нужно)

Если диагностика показала, что `overflow-x` или `overflow-y` = `visible`, нужно исправить CSS.

### Найти в файле `implementation_schedule.html`:

1. **Основное определение `.chart-container`** (примерно строка 2338):
   ```css
   .chart-container {
       ...
       overflow-x: auto;  /* ДОЛЖНО БЫТЬ auto, НЕ visible! */
       overflow-y: auto;  /* ДОЛЖНО БЫТЬ auto, НЕ visible! */
       ...
   }
   ```

2. **Медиа-запросы** - проверьте все `@media` блоки, где определяется `.chart-container`:
   - Убедитесь, что там `overflow-x: auto` или `overflow-x: scroll`
   - НЕ должно быть `overflow: hidden` или `overflow: visible`

## Шаг 3: Проверка вызова функции

Убедитесь, что `updateStickyColumns()` вызывается ПОСЛЕ `renderGantt()`.

Найдите в коде (примерно строка 12588):
```javascript
// Обновляем позиции фиксированных колонок после отрисовки строк
updateStickyColumns();
```

И (примерно строка 24956):
```javascript
renderGantt();
renderTable();
renderStageTabs();
updateStickyButtons();
updateStickyColumns();  // Должно быть после renderGantt()
```

## Шаг 4: Тестирование

1. Откройте страницу с диаграммой Ганта
2. Откройте консоль (F12)
3. Включите тогл для столбца "Задача" (первый тогл в заголовке)
4. Прокрутите диаграмму горизонтально
5. Столбец "Задача" должен оставаться видимым слева

## Если все еще не работает

Выполните в консоли:
```javascript
// Принудительное применение sticky
const chart = document.getElementById('ganttChart');
const labels = chart.querySelectorAll('.gantt-label');
labels.forEach((el, index) => {
    el.style.position = 'sticky';
    el.style.left = '0px';
    el.style.zIndex = '11';
    el.style.background = getComputedStyle(document.body).backgroundColor;
    console.log(`Применено к элементу ${index}:`, el);
});
```

Если после этого столбцы фиксируются, значит проблема в функции `updateStickyColumns()` или в том, что она не вызывается правильно.



