// ТЕСТОВЫЙ СКРИПТ ДЛЯ ПРОВЕРКИ STICKY
// Скопируйте и вставьте в консоль браузера (F12) на странице с диаграммой Ганта

console.log('=== ТЕСТ ФИКСАЦИИ СТОЛБЦОВ ===\n');

// 1. Проверка элемента
const chart = document.getElementById('ganttChart');
if (!chart) {
    console.error('❌ Элемент #ganttChart не найден!');
} else {
    console.log('✅ Элемент #ganttChart найден');
    
    // 2. Проверка родительского контейнера
    const container = chart.closest('.chart-container');
    if (container) {
        const style = getComputedStyle(container);
        console.log('\n📦 Родительский контейнер:');
        console.log('   overflow-x:', style.overflowX);
        console.log('   overflow-y:', style.overflowY);
        
        if (style.overflowX === 'visible' || style.overflowY === 'visible') {
            console.error('❌ ПРОБЛЕМА: overflow = visible блокирует sticky!');
            console.log('   Нужно изменить на overflow-x: auto и overflow-y: auto');
        } else {
            console.log('✅ overflow правильный');
        }
    }
    
    // 3. Проверка элементов
    console.log('\n🔍 Проверка элементов:');
    const label = chart.querySelector('.gantt-label');
    const startCell = chart.querySelector('.gantt-details-cell.start-col');
    
    if (label) {
        console.log('✅ .gantt-label найден');
        const style = getComputedStyle(label);
        console.log('   Текущий position:', style.position);
        console.log('   Текущий left:', style.left);
    } else {
        console.error('❌ .gantt-label НЕ найден!');
    }
    
    if (startCell) {
        console.log('✅ .gantt-details-cell.start-col найден');
    } else {
        console.error('❌ .gantt-details-cell.start-col НЕ найден!');
    }
    
    // 4. Проверка stickyColumns
    console.log('\n📋 Состояние stickyColumns:');
    if (typeof stickyColumns !== 'undefined') {
        console.log('   Set:', Array.from(stickyColumns));
        console.log('   Размер:', stickyColumns.size);
        if (stickyColumns.size === 0) {
            console.warn('⚠️ stickyColumns пуст - включите тогл для столбца!');
        }
    } else {
        console.error('❌ stickyColumns не определена!');
    }
    
    // 5. Тест принудительного применения sticky
    console.log('\n🧪 Тест принудительного применения sticky:');
    if (label) {
        const bgColor = getComputedStyle(document.body).backgroundColor;
        label.style.position = 'sticky';
        label.style.left = '0px';
        label.style.zIndex = '11';
        label.style.background = bgColor;
        label.style.backgroundColor = bgColor;
        
        setTimeout(() => {
            const newStyle = getComputedStyle(label);
            console.log('   После применения:');
            console.log('   position:', newStyle.position);
            console.log('   left:', newStyle.left);
            if (newStyle.position === 'sticky') {
                console.log('   ✅ position: sticky применен успешно!');
                console.log('   Теперь прокрутите диаграмму горизонтально - столбец должен фиксироваться');
            } else {
                console.error('   ❌ position: sticky НЕ применен!');
                console.log('   Возможно, CSS переопределяет стили или родительский контейнер блокирует');
            }
        }, 100);
    }
    
    // 6. Проверка функции
    console.log('\n⚙️ Проверка функции updateStickyColumns:');
    if (typeof updateStickyColumns === 'function') {
        console.log('✅ Функция определена');
        console.log('   Вызываем функцию...');
        updateStickyColumns();
        
        setTimeout(() => {
            if (label) {
                const style = getComputedStyle(label);
                console.log('   После вызова функции:');
                console.log('   position:', style.position);
                console.log('   left:', style.left);
                if (style.position === 'sticky') {
                    console.log('   ✅ Функция работает!');
                } else {
                    console.error('   ❌ Функция не применила sticky!');
                    console.log('   Проверьте консоль на наличие ошибок или предупреждений');
                }
            }
        }, 200);
    } else {
        console.error('❌ Функция updateStickyColumns не определена!');
    }
}

console.log('\n=== КОНЕЦ ТЕСТА ===');
console.log('Прокрутите диаграмму горизонтально и проверьте, фиксируется ли столбец');
