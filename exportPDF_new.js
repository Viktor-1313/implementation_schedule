// НОВАЯ ВЕРСИЯ ФУНКЦИИ exportPDF - полностью переписана с нуля
// Эта функция будет вставлена в implementation_schedule.html

async function exportPDF(scaleMode = 'day', includeDiagram = true, margins = null) {
    if (!tasks || !tasks.length) {
        alert('Ошибка: нет задач для экспорта в PDF');
        return;
    }
    
    // Загружаем библиотеку html2pdf.js
    try {
        await loadHtml2Pdf();
    } catch (error) {
        alert('Не удалось загрузить библиотеку для экспорта в PDF.');
        return;
    }
    
    if (typeof html2pdf === 'undefined') {
        alert('Библиотека html2pdf не доступна.');
        return;
    }

    const logoEl = document.getElementById('companyLogo');
    const nameDisplay = document.getElementById('companyNameDisplay');
    
    // Вспомогательные функции
    const formatDateKeyLocal = (date) => {
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    
    const formatDateForDisplay = (date) => {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ru-RU');
    };
    
    const getNearestDeadline = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let nearestDate = null;
        let minDiff = Infinity;
        tasks.forEach(task => {
            if (!task.endDate) return;
            const endDate = task.endDate instanceof Date ? new Date(task.endDate) : new Date(task.endDate);
            if (isNaN(endDate.getTime())) return;
            endDate.setHours(0, 0, 0, 0);
            const statuses = task.dateStatuses || {};
            const workDays = (task.dates || []).filter(d => {
                const dateObj = d instanceof Date ? d : new Date(d);
                if (isNaN(dateObj.getTime())) return false;
                return statuses[formatDateKeyLocal(dateObj)] !== 'weekend-manual';
            });
            if (workDays.length === 0) return;
            const allCompleted = workDays.every(d => statuses[formatDateKeyLocal(d)] === 'completed');
            if (allCompleted) return;
            if (endDate >= today) {
                const diff = endDate.getTime() - today.getTime();
                if (diff < minDiff) {
                    minDiff = diff;
                    nearestDate = endDate;
                }
            }
        });
        return nearestDate;
    };
    
    const calculateStatistics = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let completed = 0;
        let overdue = 0;
        let projectStartDate = null;
        let projectEndDate = null;
        tasks.forEach(task => {
            if (task.startDate) {
                const startDate = task.startDate instanceof Date ? new Date(task.startDate) : new Date(task.startDate);
                if (!isNaN(startDate.getTime())) {
                    if (!projectStartDate || startDate < projectStartDate) projectStartDate = startDate;
                }
            }
            if (task.endDate) {
                const endDate = task.endDate instanceof Date ? new Date(task.endDate) : new Date(task.endDate);
                if (!isNaN(endDate.getTime())) {
                    if (!projectEndDate || endDate > projectEndDate) projectEndDate = endDate;
                }
            }
            if (!task.dates || task.dates.length === 0) return;
            const statuses = task.dateStatuses || {};
            const workDays = (task.dates || []).filter(d => {
                const dateObj = d instanceof Date ? d : new Date(d);
                if (isNaN(dateObj.getTime())) return false;
                return statuses[formatDateKeyLocal(dateObj)] !== 'weekend-manual';
            });
            if (workDays.length === 0) return;
            const allCompleted = workDays.every(d => statuses[formatDateKeyLocal(d)] === 'completed');
            if (allCompleted) {
                completed++;
            } else {
                const endDate = task.endDate ? new Date(task.endDate) : null;
                if (endDate) {
                    endDate.setHours(0, 0, 0, 0);
                    if (endDate < today) overdue++;
                }
            }
        });
        return { completed, overdue, projectStartDate, projectEndDate };
    };
    
    // Создание логотипа на странице (logo.png 100x100)
    const createPageLogo = () => {
        const logoContainer = document.createElement('div');
        logoContainer.className = 'pdf-page-logo';
        logoContainer.style.position = 'absolute';
        logoContainer.style.top = '12px';
        logoContainer.style.right = '12px';
        logoContainer.style.width = '80px';
        logoContainer.style.height = '80px';
        logoContainer.style.zIndex = '1000';
        logoContainer.style.opacity = '0.28';
        logoContainer.style.pointerEvents = 'none';
        const logoImg = document.createElement('img');
        logoImg.src = 'logo.png';
        logoImg.alt = 'Логотип';
        logoImg.style.width = '100%';
        logoImg.style.height = '100%';
        logoImg.style.objectFit = 'contain';
        logoImg.style.display = 'block';
        logoImg.onerror = function() { this.src = 'favicon.png'; };
        logoContainer.appendChild(logoImg);
        return logoContainer;
    };
    
    // Создание секции страницы
    const createPageSection = (isFirst = false) => {
        const section = document.createElement('div');
        section.className = 'pdf-page-section';
        section.style.width = '100%';
        section.style.position = 'relative';
        section.style.padding = '0';
        section.style.background = '#ffffff';
        section.style.pageBreakInside = 'avoid';
        section.style.breakInside = 'avoid';
        section.style.boxSizing = 'border-box';
        section.style.margin = '0';
        section.style.marginLeft = '0';
        section.style.marginRight = '0';
        section.style.overflow = 'visible';
        if (!isFirst) {
            section.style.pageBreakBefore = 'always';
            section.style.breakBefore = 'page';
        }
        section.appendChild(createPageLogo());
        return section;
    };
    
    const addCellBorder = (td) => {
        td.style.border = '1px solid #cccccc';
        td.style.padding = '4px 6px';
    };
    
    // Создание титульного листа
    const createTitlePage = () => {
        const stats = calculateStatistics();
        const nearestDeadline = getNearestDeadline();
        const titleSection = document.createElement('div');
        titleSection.className = 'pdf-page-section';
        titleSection.style.position = 'relative';
        titleSection.style.width = '100%';
        titleSection.style.padding = '60px 40px';
        titleSection.style.background = '#ffffff';
        titleSection.style.display = 'block';
        titleSection.style.overflow = 'visible';
        titleSection.style.visibility = 'visible';
        titleSection.style.opacity = '1';
        titleSection.style.pageBreakAfter = 'auto';
        titleSection.style.breakAfter = 'auto';
        titleSection.style.pageBreakInside = 'avoid';
        titleSection.style.breakInside = 'avoid';
        titleSection.style.pageBreakBefore = 'auto';
        titleSection.style.breakBefore = 'auto';
        titleSection.appendChild(createPageLogo());
        
        const contentWrapper = document.createElement('div');
        contentWrapper.style.width = '100%';
        contentWrapper.style.maxWidth = '600px';
        contentWrapper.style.margin = '0 auto';
        contentWrapper.style.display = 'block';
        contentWrapper.style.textAlign = 'center';
        contentWrapper.style.position = 'relative';
        
        // Логотип компании 200x200 по центру
        if (logoEl && logoEl.src) {
            const logoClone = document.createElement('img');
            logoClone.src = logoEl.src;
            logoClone.style.width = '200px';
            logoClone.style.height = '200px';
            logoClone.style.borderRadius = '12px';
            logoClone.style.border = '2px solid #e0e0e0';
            logoClone.style.objectFit = 'contain';
            logoClone.style.background = '#fafafa';
            logoClone.style.padding = '8px';
            logoClone.style.display = 'block';
            logoClone.style.margin = '0 auto 30px auto';
            contentWrapper.appendChild(logoClone);
        }
        
        // Название компании
        const currentNameText = nameDisplay && nameDisplay.classList.contains('has-value')
            ? (nameDisplay.innerText || nameDisplay.textContent) : '';
        const companyNameTitle = document.createElement('div');
        companyNameTitle.textContent = currentNameText || 'Название компании';
        companyNameTitle.style.fontSize = '28px';
        companyNameTitle.style.fontWeight = '700';
        companyNameTitle.style.color = '#333333';
        companyNameTitle.style.marginBottom = '15px';
        companyNameTitle.style.textAlign = 'center';
        contentWrapper.appendChild(companyNameTitle);
        
        // Название ЖК
        const objectNameDisplay = document.getElementById('companyObjectNameDisplay');
        let objectName = '';
        if (objectNameDisplay && objectNameDisplay.style.display !== 'none') {
            objectName = (objectNameDisplay.innerText || objectNameDisplay.textContent || '').trim();
        }
        if (!objectName && typeof companyObjectName !== 'undefined' && companyObjectName) {
            objectName = String(companyObjectName).trim();
        }
        if (objectName && objectName.length > 0) {
            const objectNameTitle = document.createElement('div');
            objectNameTitle.textContent = objectName;
            objectNameTitle.style.fontSize = '22px';
            objectNameTitle.style.fontWeight = '600';
            objectNameTitle.style.color = '#2196f3';
            objectNameTitle.style.marginBottom = '30px';
            objectNameTitle.style.textAlign = 'center';
            contentWrapper.appendChild(objectNameTitle);
        }
        
        // Статистика
        const statsContainer = document.createElement('div');
        statsContainer.style.marginTop = '40px';
        statsContainer.style.textAlign = 'left';
        statsContainer.style.display = 'inline-block';
        
        if (stats.projectStartDate) {
            const row = document.createElement('div');
            row.style.marginBottom = '10px';
            row.style.fontSize = '14px';
            const label = document.createElement('span');
            label.textContent = 'Дата начала: ';
            label.style.fontWeight = '600';
            const value = document.createElement('span');
            value.textContent = formatDateForDisplay(stats.projectStartDate);
            row.appendChild(label);
            row.appendChild(value);
            statsContainer.appendChild(row);
        }
        
        if (stats.projectEndDate) {
            const row = document.createElement('div');
            row.style.marginBottom = '10px';
            row.style.fontSize = '14px';
            const label = document.createElement('span');
            label.textContent = 'Дата окончания: ';
            label.style.fontWeight = '600';
            const value = document.createElement('span');
            value.textContent = formatDateForDisplay(stats.projectEndDate);
            row.appendChild(label);
            row.appendChild(value);
            statsContainer.appendChild(row);
        }
        
        const completedRow = document.createElement('div');
        completedRow.style.marginBottom = '10px';
        completedRow.style.fontSize = '14px';
        const completedLabel = document.createElement('span');
        completedLabel.textContent = 'Задач выполнено: ';
        completedLabel.style.fontWeight = '600';
        const completedValue = document.createElement('span');
        completedValue.textContent = String(stats.completed);
        completedValue.style.color = '#4caf50';
        completedRow.appendChild(completedLabel);
        completedRow.appendChild(completedValue);
        statsContainer.appendChild(completedRow);
        
        const overdueRow = document.createElement('div');
        overdueRow.style.marginBottom = '10px';
        overdueRow.style.fontSize = '14px';
        const overdueLabel = document.createElement('span');
        overdueLabel.textContent = 'Задач просрочено: ';
        overdueLabel.style.fontWeight = '600';
        const overdueValue = document.createElement('span');
        overdueValue.textContent = String(stats.overdue);
        overdueValue.style.color = '#f44336';
        overdueRow.appendChild(overdueLabel);
        overdueRow.appendChild(overdueValue);
        statsContainer.appendChild(overdueRow);
        
        if (nearestDeadline) {
            const deadlineRow = document.createElement('div');
            deadlineRow.style.marginBottom = '10px';
            deadlineRow.style.fontSize = '14px';
            const deadlineLabel = document.createElement('span');
            deadlineLabel.textContent = 'Ближайший дедлайн: ';
            deadlineLabel.style.fontWeight = '600';
            const deadlineValue = document.createElement('span');
            deadlineValue.textContent = formatDateForDisplay(nearestDeadline);
            deadlineValue.style.color = '#ff9800';
            deadlineRow.appendChild(deadlineLabel);
            deadlineRow.appendChild(deadlineValue);
            statsContainer.appendChild(deadlineRow);
        }
        
        contentWrapper.appendChild(statsContainer);
        titleSection.appendChild(contentWrapper);
        return titleSection;
    };
    
    // Контейнер для экспорта
    const mmToPx = 3.779527559;
    const a3WidthPx = 420 * mmToPx;
    const a3HeightPx = 297 * mmToPx;
    
    const exportWrapper = document.createElement('div');
    exportWrapper.style.width = a3WidthPx + 'px';
    exportWrapper.style.maxWidth = a3WidthPx + 'px';
    exportWrapper.style.margin = '0';
    exportWrapper.style.background = '#ffffff';
    exportWrapper.style.fontFamily = window.getComputedStyle(document.body).fontFamily || 'sans-serif';
    exportWrapper.style.fontSize = '10px';
    exportWrapper.style.color = '#000';
    exportWrapper.style.visibility = 'visible';
    exportWrapper.style.display = 'block';
    exportWrapper.style.opacity = '1';
    exportWrapper.style.boxSizing = 'border-box';
    exportWrapper.style.overflow = 'visible';
    
    // Создаем титульный лист
    const titlePage = createTitlePage();
    exportWrapper.appendChild(titlePage);
    
    // Создаем таблицы диаграммы Ганта
    if (includeDiagram !== false) {
        const timelineUnits = buildExportTimeline(scaleMode);
        if (timelineUnits.length > 0) {
            const statusColors = {
                pending: '#1e88e5',
                'in-progress': '#ff9800',
                completed: '#4caf50',
                'weekend-manual': '#ffe0e0'
            };
            
            // Разбиваем на части - каждая часть на новом листе
            const unitsPerPage = scaleMode === 'day' ? 30 : scaleMode === 'week' ? 15 : 10;
            const chunks = [];
            for (let i = 0; i < timelineUnits.length; i += unitsPerPage) {
                chunks.push(timelineUnits.slice(i, i + unitsPerPage));
            }
            
            chunks.forEach((chunk, chunkIdx) => {
                const section = createPageSection(chunkIdx === 0 ? true : false);
                
                const ganttTable = document.createElement('table');
                ganttTable.className = 'gantt-diagram-table';
                ganttTable.style.borderCollapse = 'collapse';
                ganttTable.style.width = '100%';
                ganttTable.style.maxWidth = '100%';
                ganttTable.style.fontSize = '10px';
                ganttTable.style.margin = '0';
                ganttTable.style.marginLeft = '0';
                ganttTable.style.marginRight = '0';
                ganttTable.style.marginTop = '0';
                ganttTable.style.marginBottom = '0';
                ganttTable.style.tableLayout = 'fixed';
                ganttTable.style.pageBreakInside = 'avoid';
                ganttTable.style.breakInside = 'avoid';
                
                // Базовые заголовки
                const baseHeaders = ['Задача', 'Ответственный', 'Дата начала', 'Дата окончания', 'Рабочих дней'];
                
                // Вычисляем ширину столбцов
                // Первый столбец - по последнему символу (самая длинная строка)
                let firstColumnMaxLength = baseHeaders[0].length;
                tasks.forEach(task => {
                    let value = task.task || '';
                    if (task.onTravel === true || task.onTravel === 'true') value = '✈ ' + value;
                    if (value.length > firstColumnMaxLength) firstColumnMaxLength = value.length;
                });
                
                // Остальные столбцы - по первой строке (заголовку)
                const charWidth = 8; // ширина символа для шрифта 10px
                const padding = 10;
                
                const baseColumnWidths = baseHeaders.map((header, idx) => {
                    if (idx === 0) {
                        return `${(firstColumnMaxLength * charWidth) + padding}px`;
                    } else {
                        return `${(header.length * charWidth) + padding}px`;
                    }
                });
                
                // Ширина столбцов дат - по первой строке
                let maxDateLabelLength = 0;
                chunk.forEach(unit => {
                    if ((unit.label || '').length > maxDateLabelLength) {
                        maxDateLabelLength = (unit.label || '').length;
                    }
                });
                const dateColumnWidth = maxDateLabelLength > 0 
                    ? `${Math.max((maxDateLabelLength * 7) + padding, 30)}px` 
                    : '30px';
                
                // Вычисляем общую ширину базовых столбцов
                const baseColumnsTotalWidth = baseColumnWidths.reduce((sum, w) => {
                    return sum + parseFloat(w);
                }, 0);
                
                // Вычисляем доступную ширину для столбцов дат
                const availableWidth = a3WidthPx - baseColumnsTotalWidth - 20; // 20px для отступов
                const dateColumnCalculatedWidth = Math.max(availableWidth / chunk.length, parseFloat(dateColumnWidth));
                
                // Создаем заголовок таблицы
                const headerTr = document.createElement('tr');
                baseHeaders.forEach((text, idx) => {
                    const th = document.createElement('th');
                    th.textContent = text;
                    th.style.background = '#f5f5f5';
                    th.style.color = '#222222';
                    th.style.fontWeight = '600';
                    th.style.fontSize = '10px';
                    th.style.whiteSpace = idx === 0 ? 'normal' : 'nowrap';
                    th.style.width = baseColumnWidths[idx];
                    th.style.padding = '6px 8px';
                    th.style.border = '1px solid #cccccc';
                    headerTr.appendChild(th);
                });
                
                chunk.forEach(unit => {
                    const th = document.createElement('th');
                    th.textContent = unit.label;
                    th.style.background = '#e3f2fd';
                    th.style.color = '#222222';
                    th.style.fontWeight = '600';
                    th.style.fontSize = '9px';
                    th.style.whiteSpace = 'nowrap';
                    th.style.width = dateColumnCalculatedWidth + 'px';
                    th.style.padding = '6px 4px';
                    th.style.border = '1px solid #cccccc';
                    headerTr.appendChild(th);
                });
                
                ganttTable.appendChild(headerTr);
                
                // Строки задач
                tasks.forEach(task => {
                    const tr = document.createElement('tr');
                    tr.style.pageBreakInside = 'avoid';
                    tr.style.breakInside = 'avoid';
                    
                    let taskName = task.task || '';
                    if (task.onTravel === true || task.onTravel === 'true') taskName = '✈ ' + taskName;
                    
                    const baseValues = [
                        taskName,
                        task.responsible || '',
                        task.startDate ? task.startDate.toLocaleDateString('ru-RU') : '',
                        task.endDate ? task.endDate.toLocaleDateString('ru-RU') : '',
                        task.days != null ? String(task.days) : ''
                    ];
                    
                    baseValues.forEach((val, idx) => {
                        const td = document.createElement('td');
                        td.textContent = val;
                        td.style.fontSize = '10px';
                        td.style.whiteSpace = idx === 0 ? 'normal' : 'nowrap';
                        td.style.width = baseColumnWidths[idx];
                        td.style.padding = '6px 8px';
                        td.style.border = '1px solid #cccccc';
                        tr.appendChild(td);
                    });
                    
                    const statuses = task.dateStatuses || {};
                    chunk.forEach(unit => {
                        const td = document.createElement('td');
                        td.style.width = dateColumnCalculatedWidth + 'px';
                        td.style.padding = '6px 4px';
                        td.style.border = '1px solid #cccccc';
                        
                        const unitStart = unit.start.getTime();
                        const unitEnd = unit.end.getTime();
                        let hasWorkday = false;
                        let intervalStatus = 'pending';
                        
                        if (Array.isArray(task.dates)) {
                            const daysInUnit = task.dates.filter(d => {
                                const dateObj = d instanceof Date ? d : new Date(d);
                                if (isNaN(dateObj.getTime())) return false;
                                const t = dateObj.getTime();
                                return t >= unitStart && t <= unitEnd;
                            });
                            
                            if (daysInUnit.length > 0) {
                                hasWorkday = true;
                                if (scaleMode === 'day' && daysInUnit.length === 1) {
                                    intervalStatus = statuses[formatDateKeyLocal(daysInUnit[0])] || 'pending';
                                } else {
                                    const statusesInUnit = new Set();
                                    daysInUnit.forEach(d => {
                                        const s = statuses[formatDateKeyLocal(d)];
                                        if (s) statusesInUnit.add(s);
                                    });
                                    if (statusesInUnit.has('completed')) intervalStatus = 'completed';
                                    else if (statusesInUnit.has('in-progress')) intervalStatus = 'in-progress';
                                    else if (statusesInUnit.has('weekend-manual')) intervalStatus = 'weekend-manual';
                                    else intervalStatus = 'pending';
                                }
                            }
                        }
                        
                        if (hasWorkday) {
                            td.style.background = statusColors[intervalStatus] || statusColors.pending;
                        }
                        
                        tr.appendChild(td);
                    });
                    
                    ganttTable.appendChild(tr);
                });
                
                section.appendChild(ganttTable);
                exportWrapper.appendChild(section);
            });
        }
    }
    
    // Детальная таблица задач
    const hasDiagramSections = exportWrapper.querySelectorAll('.pdf-page-section').length > 1;
    if (tasks && tasks.length > 0) {
        const detailSection = createPageSection(hasDiagramSections ? false : true);
        detailSection.style.pageBreakInside = 'auto';
        detailSection.style.breakInside = 'auto';
        
        const detailTable = document.createElement('table');
        detailTable.className = 'detail-tasks-table';
        detailTable.style.borderCollapse = 'collapse';
        detailTable.style.width = '100%';
        detailTable.style.maxWidth = '100%';
        detailTable.style.margin = '0';
        detailTable.style.marginTop = '0';
        detailTable.style.tableLayout = 'fixed';
        
        const detailHeaders = [
            '№ п/п', 'Этап', 'Вид контроля', 'Мероприятие', 'Рабочих дней',
            'Ответственный', 'Дата начала', 'Дата окончания', 'Комментарии по датам'
        ];
        
        // Вычисляем ширину столбцов
        let firstColumnMaxLength = detailHeaders[0].length;
        tasks.forEach((task, idx) => {
            if (String(idx + 1).length > firstColumnMaxLength) {
                firstColumnMaxLength = String(idx + 1).length;
            }
        });
        
        let eventColumnMaxLength = detailHeaders[3].length;
        tasks.forEach(task => {
            let value = task.task || '';
            if (task.onTravel === true || task.onTravel === 'true') value = '✈ ' + value;
            if (value.length > eventColumnMaxLength) eventColumnMaxLength = value.length;
        });
        
        let commentsColumnMaxLength = detailHeaders[8].length;
        tasks.forEach(task => {
            if (task.dateComments) {
                const entries = Object.entries(task.dateComments)
                    .filter(([, text]) => text && String(text).trim().length > 0)
                    .map(([date, text]) => `${date}: ${String(text).trim()}`);
                const summary = entries.join('; ');
                if (summary.length > commentsColumnMaxLength) commentsColumnMaxLength = summary.length;
            }
        });
        
        const charWidth = 8;
        const padding = 10;
        
        const detailColumnWidths = detailHeaders.map((header, idx) => {
            if (idx === 0) return `${(firstColumnMaxLength * charWidth) + padding}px`;
            if (idx === 3) return `${(eventColumnMaxLength * charWidth) + padding}px`;
            if (idx === 8) return `${(commentsColumnMaxLength * charWidth) + padding}px`;
            return `${(header.length * charWidth) + padding}px`;
        });
        
        // Вычисляем общую ширину всех столбцов
        const totalColumnsWidth = detailColumnWidths.reduce((sum, w) => sum + parseFloat(w), 0);
        
        // Если общая ширина больше доступной, пропорционально уменьшаем
        if (totalColumnsWidth > a3WidthPx - 20) {
            const scale = (a3WidthPx - 20) / totalColumnsWidth;
            detailColumnWidths.forEach((w, idx) => {
                detailColumnWidths[idx] = (parseFloat(w) * scale) + 'px';
            });
        }
        
        // Заголовок таблицы
        const detailHeaderTr = document.createElement('tr');
        detailHeaders.forEach((text, idx) => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.background = '#f5f5f5';
            th.style.color = '#222222';
            th.style.fontWeight = '600';
            th.style.fontSize = '10px';
            th.style.whiteSpace = idx === 3 || idx === 8 ? 'normal' : 'nowrap';
            th.style.width = detailColumnWidths[idx];
            th.style.padding = '6px 8px';
            th.style.border = '1px solid #cccccc';
            detailHeaderTr.appendChild(th);
        });
        detailTable.appendChild(detailHeaderTr);
        
        // Строки задач
        tasks.forEach((task, idx) => {
            const tr = document.createElement('tr');
            tr.style.pageBreakInside = 'avoid';
            tr.style.breakInside = 'avoid';
            
            let commentsSummary = '';
            if (task.dateComments) {
                const entries = Object.entries(task.dateComments)
                    .filter(([, text]) => text && String(text).trim().length > 0)
                    .sort(([d1], [d2]) => (d1 < d2 ? -1 : d1 > d2 ? 1 : 0))
                    .map(([date, text]) => `${date}: ${String(text).trim()}`);
                commentsSummary = entries.join('; ');
            }
            
            let taskName = task.task || '';
            if (task.onTravel === true || task.onTravel === 'true') taskName = '✈ ' + taskName;
            
            const cells = [
                idx + 1,
                task.stage || '',
                task.control || '',
                taskName,
                task.days != null ? String(task.days) : '',
                task.responsible || '',
                task.startDate ? task.startDate.toLocaleDateString('ru-RU') : '',
                task.endDate ? task.endDate.toLocaleDateString('ru-RU') : '',
                commentsSummary
            ];
            
            cells.forEach((val, cellIdx) => {
                const td = document.createElement('td');
                td.textContent = val;
                td.style.fontSize = '10px';
                td.style.whiteSpace = cellIdx === 3 || cellIdx === 8 ? 'normal' : 'nowrap';
                td.style.width = detailColumnWidths[cellIdx];
                td.style.padding = '6px 8px';
                td.style.border = '1px solid #cccccc';
                tr.appendChild(td);
            });
            
            detailTable.appendChild(tr);
        });
        
        detailSection.appendChild(detailTable);
        exportWrapper.appendChild(detailSection);
    }
    
    // CSS стили
    const style = document.createElement('style');
    style.textContent = `
        .pdf-page-section {
            width: 100% !important;
            margin: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            position: relative !important;
            padding-left: 0 !important;
        }
        .pdf-page-logo {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            width: 80px !important;
            height: 80px !important;
            z-index: 1000 !important;
            pointer-events: none !important;
            opacity: 0.28 !important;
        }
        .pdf-page-logo img {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            display: block !important;
        }
        .pdf-page-section table {
            margin-left: 0 !important;
            margin-right: 0 !important;
            width: 100% !important;
            table-layout: fixed !important;
            min-width: 100% !important;
        }
        .pdf-page-section table.gantt-diagram-table {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            table-layout: fixed !important;
        }
        .pdf-page-section table.detail-tasks-table {
            page-break-inside: auto !important;
            break-inside: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            table-layout: fixed !important;
        }
        .pdf-page-section table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
        @media print {
            .pdf-page-section {
                page-break-before: always;
                break-before: page;
                position: relative !important;
                margin: 0 !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
            }
            .pdf-page-section:first-child {
                page-break-before: auto;
                break-before: auto;
            }
            .pdf-page-section table.gantt-diagram-table {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            .pdf-page-section table.detail-tasks-table {
                page-break-inside: auto !important;
                break-inside: auto !important;
            }
            .pdf-page-section tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
    `;
    exportWrapper.appendChild(style);
    
    // Показываем индикатор загрузки
    const loadingIndicator = document.createElement('div');
    loadingIndicator.textContent = 'Генерация PDF...';
    loadingIndicator.style.position = 'fixed';
    loadingIndicator.style.top = '50%';
    loadingIndicator.style.left = '50%';
    loadingIndicator.style.transform = 'translate(-50%, -50%)';
    loadingIndicator.style.padding = '20px 40px';
    loadingIndicator.style.background = 'rgba(0, 0, 0, 0.8)';
    loadingIndicator.style.color = '#fff';
    loadingIndicator.style.borderRadius = '8px';
    loadingIndicator.style.zIndex = '999999';
    loadingIndicator.style.fontSize = '16px';
    loadingIndicator.style.fontWeight = '600';
    document.body.appendChild(loadingIndicator);
    
    document.body.appendChild(exportWrapper);
    
    setTimeout(async () => {
        const sections = exportWrapper.querySelectorAll('.pdf-page-section');
        if (sections.length === 0) {
            if (loadingIndicator.parentNode) document.body.removeChild(loadingIndicator);
            if (exportWrapper.parentNode) document.body.removeChild(exportWrapper);
            alert('Ошибка: нет данных для экспорта в PDF');
            return;
        }
        
        // Применяем отступы к секциям (кроме титульного листа)
        sections.forEach((section, index) => {
            if (index === 0) return; // Титульный лист
            section.style.padding = '0';
            section.style.paddingTop = '10mm';
            section.style.paddingBottom = '20mm';
            section.style.paddingLeft = '0';
            section.style.paddingRight = '5mm';
            section.style.boxSizing = 'border-box';
        });
        
        const mmToPx = 3.779527559;
        const a3WidthPx = 420 * mmToPx;
        const actualWidth = Math.max(exportWrapper.scrollWidth || 0, exportWrapper.offsetWidth || 0, a3WidthPx);
        const totalSectionsHeight = Array.from(sections).reduce((sum, section) => {
            return sum + (section.offsetHeight || section.scrollHeight || 1123);
        }, 0);
        const finalHeight = Math.max(exportWrapper.scrollHeight || 0, exportWrapper.offsetHeight || 0, totalSectionsHeight, sections.length * 1123);
        
        exportWrapper.style.position = 'absolute';
        exportWrapper.style.left = '0';
        exportWrapper.style.top = '0';
        exportWrapper.style.width = actualWidth + 'px';
        exportWrapper.style.height = finalHeight + 'px';
        exportWrapper.style.minHeight = finalHeight + 'px';
        exportWrapper.style.visibility = 'visible';
        exportWrapper.style.opacity = '1';
        exportWrapper.style.display = 'block';
        exportWrapper.style.overflow = 'visible';
        exportWrapper.style.zIndex = '999998';
        exportWrapper.style.background = '#ffffff';
        exportWrapper.style.pointerEvents = 'none';
        
        // Ждем загрузки изображений
        const images = exportWrapper.querySelectorAll('img');
        const imagePromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 2000);
            });
        });
        await Promise.all(imagePromises);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const opt = {
            margin: [0, 0, 0, 0],
            filename: generateExportFileName('pdf'),
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: actualWidth,
                windowHeight: finalHeight,
                width: actualWidth,
                height: finalHeight,
                allowTaint: true,
                backgroundColor: '#ffffff',
                x: 0,
                y: 0,
                scrollX: 0,
                scrollY: 0,
                removeContainer: false,
                imageTimeout: 15000
            },
            jsPDF: { 
                orientation: 'landscape', 
                unit: 'mm', 
                format: 'a3',
                compress: false
            },
            pagebreak: { 
                mode: ['css', 'legacy'],
                before: '.pdf-page-section:not(:first-child)',
                after: [],
                avoid: []
            },
            enableLinks: false
        };
        
        html2pdf()
            .set(opt)
            .from(exportWrapper)
            .save()
            .then(() => {
                if (exportWrapper.parentNode) document.body.removeChild(exportWrapper);
                loadingIndicator.textContent = 'PDF готов!';
                setTimeout(() => {
                    if (loadingIndicator.parentNode) document.body.removeChild(loadingIndicator);
                }, 3000);
            })
            .catch((err) => {
                console.error('Ошибка генерации PDF:', err);
                if (exportWrapper.parentNode) document.body.removeChild(exportWrapper);
                if (loadingIndicator.parentNode) document.body.removeChild(loadingIndicator);
                alert('Произошла ошибка при генерации PDF: ' + (err.message || 'неизвестная ошибка'));
            });
    }, 500);
}



