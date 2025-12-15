// ФИНАЛЬНОЕ РЕШЕНИЕ - ВСТАВЬТЕ В КОНСОЛЬ БРАУЗЕРА

// Этот скрипт принудительно применяет sticky и проверяет видимость

console.log('=== ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ СТОЛБЦОВ ===\n');

const chart = document.getElementById('ganttChart');
if (!chart) {
    console.error('❌ #ganttChart не найден!');
} else {
    console.log('✅ #ganttChart найден');
    
    // 1. Проверка и исправление CSS
    console.log('\n1. Проверка CSS правил...');
    const styleSheet = document.styleSheets;
    let foundImportant = false;
    
    for (let sheet of styleSheet) {
        try {
            const rules = sheet.cssRules || sheet.rules;
            for (let rule of rules) {
                if (rule.selectorText && rule.selectorText.includes('.gantt-label')) {
                    if (rule.style && rule.style.position === 'static' && rule.style.getPropertyPriority('position') === 'important') {
                        console.warn('⚠️ Найдено position: static !important в:', rule.selectorText);
                        foundImportant = true;
                    }
                }
            }
        } catch (e) {
            // Игнорируем ошибки доступа к правилам из других доменов
        }
    }
    
    if (!foundImportant) {
        console.log('✅ Проблемных !important правил не найдено');
    }
    
    // 2. Принудительное применение стилей с !important
    console.log('\n2. Принудительное применение стилей...');
    const bgColor = getComputedStyle(document.body).backgroundColor;
    
    // Применяем к заголовкам
    const headerLabels = chart.querySelectorAll('.gantt-header-label');
    headerLabels.forEach((el, i) => {
        el.style.setProperty('position', 'sticky', 'important');
        el.style.setProperty('left', '0px', 'important');
        el.style.setProperty('z-index', '11', 'important');
        el.style.setProperty('background', bgColor, 'important');
        el.style.setProperty('display', 'flex', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('min-width', '180px', 'important');
        console.log(`   ✅ Заголовок ${i}: стили применены`);
    });
    
    // Применяем к строкам
    let left = 0;
    const labelWidth = 180;
    
    const labels = chart.querySelectorAll('.gantt-label');
    labels.forEach((el, i) => {
        el.style.setProperty('position', 'sticky', 'important');
        el.style.setProperty('left', `${left}px`, 'important');
        el.style.setProperty('z-index', '11', 'important');
        el.style.setProperty('background', bgColor, 'important');
        el.style.setProperty('display', 'flex', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('min-width', '180px', 'important');
        el.style.setProperty('width', 'auto', 'important');
        if (i < 3) {
            console.log(`   ✅ Строка ${i}: стили применены, left=${left}px`);
        }
    });
    
    // Применяем к details cells если включены
    if (typeof stickyColumns !== 'undefined' && stickyColumns.has('start')) {
        left += labelWidth;
        const startCells = chart.querySelectorAll('.gantt-details-cell.start-col');
        startCells.forEach((el) => {
            el.style.setProperty('position', 'sticky', 'important');
            el.style.setProperty('left', `${left}px`, 'important');
            el.style.setProperty('z-index', '7', 'important');
            el.style.setProperty('background', bgColor, 'important');
            el.style.setProperty('display', 'flex', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
        });
        console.log(`   ✅ Столбец "Дата начала": стили применены, left=${left}px`);
    }
    
    // 3. Проверка видимости
    console.log('\n3. Проверка видимости...');
    setTimeout(() => {
        const firstLabel = chart.querySelector('.gantt-label');
        if (firstLabel) {
            const rect = firstLabel.getBoundingClientRect();
            const style = getComputedStyle(firstLabel);
            console.log('   Размеры:', rect.width, 'x', rect.height);
            console.log('   position:', style.position);
            console.log('   left:', style.left);
            console.log('   display:', style.display);
            console.log('   visibility:', style.visibility);
            
            if (rect.width > 0 && rect.height > 0) {
                console.log('   ✅ Элемент видим!');
            } else {
                console.error('   ❌ Элемент имеет нулевой размер!');
            }
            
            // Проверка контейнера
            const container = chart.closest('.chart-container');
            if (container) {
                const containerRect = container.getBoundingClientRect();
                console.log('\n4. Контейнер:');
                console.log('   Размеры:', containerRect.width, 'x', containerRect.height);
                console.log('   scrollLeft:', container.scrollLeft);
                
                // Прокручиваем в начало если нужно
                if (container.scrollLeft > 0) {
                    console.log('   ⚠️ Контейнер прокручен, прокручиваем в начало...');
                    container.scrollLeft = 0;
                }
                
                // Проверка, находится ли элемент в видимой области
                const isVisible = rect.left >= containerRect.left && 
                                rect.right <= containerRect.right &&
                                rect.width > 0;
                console.log('   Элемент в видимой области:', isVisible ? '✅' : '❌');
                
                if (!isVisible && rect.width > 0) {
                    console.warn('   ⚠️ Элемент находится вне видимой области!');
                    console.log('   Попробуйте прокрутить контейнер влево');
                }
            }
        }
        
        console.log('\n=== ГОТОВО ===');
        console.log('Теперь прокрутите диаграмму горизонтально - столбцы должны фиксироваться!');
    }, 200);
}



