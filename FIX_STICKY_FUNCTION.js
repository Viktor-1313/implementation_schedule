// ИСПРАВЛЕННАЯ ФУНКЦИЯ updateStickyColumns
// Найти функцию updateStickyColumns (примерно строка 10033) и заменить её полностью на эту версию:

        function updateStickyColumns() {
            const chart = document.getElementById('ganttChart');
            if (!chart) return;
            
            // Используем requestAnimationFrame для гарантии, что DOM полностью отрисован
            requestAnimationFrame(() => {
                const allSelectors = [
                    '.gantt-header-label',
                    '.gantt-label',
                    '.gantt-details-cell.start-col',
                    '.gantt-details-cell.end-col',
                    '.gantt-details-cell.days-col',
                    '.gantt-details-cell.link-cell',
                    '.gantt-details-cell.responsible-cell'
                ];

                // Сбрасываем прошлые стили закрепления
                chart.querySelectorAll(allSelectors.join(',')).forEach((el) => {
                    el.style.position = '';
                    el.style.left = '';
                    el.style.zIndex = '';
                    el.style.clipPath = '';
                    el.style.background = '';
                });

                const getWidth = (selector, fallback) => {
                    const el = chart.querySelector(selector);
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width) return rect.width;
                    }
                    return fallback || 0;
                };

                const labelWidth = ganttColumnWidths.label || getWidth('.gantt-header-label', 180);
                const startWidth = ganttColumnWidths.start || getWidth('.gantt-details-cell.start-col', 120);
                const endWidth = ganttColumnWidths.end || getWidth('.gantt-details-cell.end-col', 120);
                const daysWidth = ganttColumnWidths.days || getWidth('.gantt-details-cell.days-col', 90);
                const linkWidth = getWidth('.gantt-details-cell.link-cell', 70);
                const respWidth = getWidth('.gantt-details-cell.responsible-cell', 200);

                let left = 0;

                const columns = [
                    { key: 'label', selector: '.gantt-header-label, .gantt-label', width: labelWidth, visible: stickyColumns.has('label') },
                    { key: 'start', selector: '.gantt-details-cell.start-col', width: startWidth, visible: stickyColumns.has('start') },
                    { key: 'end', selector: '.gantt-details-cell.end-col', width: endWidth, visible: stickyColumns.has('end') },
                    { key: 'days', selector: '.gantt-details-cell.days-col', width: daysWidth, visible: stickyColumns.has('days') },
                    { key: 'link', selector: '.gantt-details-cell.link-cell', width: linkWidth, visible: stickyColumns.has('link') && document.body.classList.contains('show-link') },
                    { key: 'responsible', selector: '.gantt-details-cell.responsible-cell', width: respWidth, visible: stickyColumns.has('responsible') && document.body.classList.contains('show-responsible') },
                ];

                const applyLeft = (selector, z) => {
                    // Получаем computed background один раз
                    const rootStyle = getComputedStyle(document.documentElement);
                    let bgColor = rootStyle.getPropertyValue('--color-bg').trim();
                    if (!bgColor || bgColor === '') {
                        // Fallback на вычисленный цвет из body
                        bgColor = getComputedStyle(document.body).backgroundColor || '#f5f5f5';
                    }
                    
                    const elements = chart.querySelectorAll(selector);
                    if (elements.length === 0) {
                        console.warn(`⚠️ Элементы не найдены для селектора: ${selector}`);
                        return;
                    }
                    
                    console.log(`✅ Найдено ${elements.length} элементов для селектора: ${selector}, left: ${left}px`);
                    
                    elements.forEach((el) => {
                        el.style.position = 'sticky';
                        el.style.left = `${left}px`;
                        el.style.zIndex = z;
                        // Устанавливаем background явно для всех элементов, чтобы sticky работал правильно
                        el.style.background = bgColor;
                        el.style.backgroundColor = bgColor;
                        // Убираем clipPath, чтобы не мешать отображению
                        el.style.clipPath = '';
                        // Убеждаемся, что элемент виден
                        el.style.visibility = 'visible';
                        el.style.opacity = '1';
                    });
                };
                
                const resetSticky = (selector) => {
                    chart.querySelectorAll(selector).forEach((el) => {
                        el.style.position = '';
                        el.style.left = '';
                        el.style.zIndex = '';
                        el.style.background = '';
                        el.style.clipPath = '';
                    });
                };

                columns.forEach((col) => {
                    if (!col.visible) {
                        resetSticky(col.selector);
                        return;
                    }
                    applyLeft(col.selector, col.key === 'label' ? 11 : 7);
                    left += col.width;
                });

                chart.classList.toggle('has-sticky-columns', left > 0);
                chart.style.setProperty('--sticky-left-width', `${left}px`);
                
                console.log(`✅ updateStickyColumns завершена. Закреплено столбцов: ${left > 0 ? 'да' : 'нет'}, общая ширина: ${left}px`);
            });
        }



