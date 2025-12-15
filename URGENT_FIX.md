# СРОЧНОЕ ИСПРАВЛЕНИЕ - Выполните в консоли браузера

## Шаг 1: Откройте консоль
Нажмите F12 на странице с диаграммой Ганта, перейдите на вкладку "Console"

## Шаг 2: Скопируйте и выполните этот код

```javascript
// ПРИНУДИТЕЛЬНОЕ ИСПРАВЛЕНИЕ СТОЛБЦОВ
(function() {
    console.log('=== ПРИНУДИТЕЛЬНОЕ ИСПРАВЛЕНИЕ ===\n');
    
    const chart = document.getElementById('ganttChart');
    if (!chart) {
        console.error('❌ #ganttChart не найден!');
        return;
    }
    
    const bgColor = getComputedStyle(document.body).backgroundColor;
    let left = 0;
    const labelWidth = 180;
    
    // 1. Исправляем заголовки
    console.log('1. Исправление заголовков...');
    const headerLabels = chart.querySelectorAll('.gantt-header-label');
    headerLabels.forEach((el) => {
        el.style.cssText = `
            position: sticky !important;
            left: 0px !important;
            z-index: 11 !important;
            background: ${bgColor} !important;
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            min-width: 180px !important;
        `;
    });
    console.log(`   ✅ Исправлено ${headerLabels.length} заголовков`);
    
    // 2. Исправляем строки
    console.log('2. Исправление строк...');
    const labels = chart.querySelectorAll('.gantt-label');
    labels.forEach((el) => {
        el.style.cssText = `
            position: sticky !important;
            left: ${left}px !important;
            z-index: 11 !important;
            background: ${bgColor} !important;
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            min-width: 180px !important;
            width: auto !important;
        `;
    });
    console.log(`   ✅ Исправлено ${labels.length} строк`);
    
    // 3. Исправляем details cells если включены
    if (typeof stickyColumns !== 'undefined' && stickyColumns.size > 0) {
        console.log('3. Исправление дополнительных столбцов...');
        left = labelWidth;
        
        if (stickyColumns.has('start')) {
            const startCells = chart.querySelectorAll('.gantt-details-cell.start-col');
            startCells.forEach((el) => {
                el.style.cssText = `
                    position: sticky !important;
                    left: ${left}px !important;
                    z-index: 7 !important;
                    background: ${bgColor} !important;
                    display: flex !important;
                    visibility: visible !important;
                `;
            });
            console.log(`   ✅ Исправлено ${startCells.length} ячеек "Дата начала"`);
            left += 120; // примерная ширина
        }
        
        if (stickyColumns.has('end')) {
            const endCells = chart.querySelectorAll('.gantt-details-cell.end-col');
            endCells.forEach((el) => {
                el.style.cssText = `
                    position: sticky !important;
                    left: ${left}px !important;
                    z-index: 7 !important;
                    background: ${bgColor} !important;
                    display: flex !important;
                    visibility: visible !important;
                `;
            });
            console.log(`   ✅ Исправлено ${endCells.length} ячеек "Дата окончания"`);
            left += 120;
        }
    }
    
    // 4. Проверка и прокрутка контейнера
    console.log('4. Проверка контейнера...');
    const container = chart.closest('.chart-container');
    if (container) {
        if (container.scrollLeft > 0) {
            console.log('   ⚠️ Контейнер прокручен, прокручиваем в начало...');
            container.scrollLeft = 0;
        }
        console.log('   ✅ Контейнер готов');
    }
    
    // 5. Финальная проверка
    setTimeout(() => {
        console.log('\n5. Финальная проверка...');
        const firstLabel = chart.querySelector('.gantt-label');
        if (firstLabel) {
            const rect = firstLabel.getBoundingClientRect();
            const style = getComputedStyle(firstLabel);
            console.log('   Размеры:', rect.width, 'x', rect.height);
            console.log('   position:', style.position);
            console.log('   left:', style.left);
            
            if (rect.width > 0 && style.position === 'sticky') {
                console.log('   ✅ ВСЕ РАБОТАЕТ! Столбцы должны быть видны и фиксироваться!');
                console.log('\n📌 Теперь прокрутите диаграмму горизонтально - столбцы должны оставаться на месте!');
            } else {
                console.error('   ❌ Проблема сохраняется!');
                console.log('   Проверьте вывод выше для диагностики');
            }
        }
    }, 300);
    
    console.log('\n=== ИСПРАВЛЕНИЕ ЗАВЕРШЕНО ===');
})();
```

## Шаг 3: Проверьте результат

После выполнения кода:
1. Посмотрите на вывод в консоли
2. Проверьте, видите ли вы столбцы слева на диаграмме
3. Прокрутите диаграмму горизонтально - столбцы должны фиксироваться

## Если столбцы все еще не видны

Выполните дополнительную диагностику:

```javascript
// ДИАГНОСТИКА
const chart = document.getElementById('ganttChart');
const label = chart.querySelector('.gantt-label');
const container = chart.closest('.chart-container');

console.log('Элемент .gantt-label:');
console.log('  Найден:', label ? '✅' : '❌');
if (label) {
    const rect = label.getBoundingClientRect();
    const style = getComputedStyle(label);
    console.log('  Размеры:', rect.width, 'x', rect.height);
    console.log('  position:', style.position);
    console.log('  left:', style.left);
    console.log('  display:', style.display);
    console.log('  visibility:', style.visibility);
    console.log('  Координаты:', 'left=' + rect.left, 'top=' + rect.top);
}

console.log('\nКонтейнер .chart-container:');
console.log('  Найден:', container ? '✅' : '❌');
if (container) {
    const rect = container.getBoundingClientRect();
    console.log('  Размеры:', rect.width, 'x', rect.height);
    console.log('  scrollLeft:', container.scrollLeft);
    console.log('  Координаты:', 'left=' + rect.left, 'top=' + rect.top);
    
    if (label) {
        const labelRect = label.getBoundingClientRect();
        const isInView = labelRect.left >= rect.left && labelRect.right <= rect.right;
        console.log('  Элемент в видимой области:', isInView ? '✅' : '❌');
    }
}
```

Пришлите вывод этой диагностики - по нему будет видно, в чем именно проблема!



