// Скрипт для исправления функций копирования/вставки задач
// Этот файл содержит исправленный код для добавления в implementation_schedule.html

// 1. Заменить переменную (около строки 7277):
// БЫЛО: let copiedTask = null; // скопированная задача для вставки
// СТАНЕТ: let copiedTasks = []; // массив скопированных задач для вставки

// 2. Заменить функцию copyTask (около строки 14431):
const newCopyTaskFunction = `
        // Копирование задач (может быть одна или несколько)
        function copyTask(taskIds) {
            // Поддержка как одного ID, так и массива ID для обратной совместимости
            const idsToCopy = Array.isArray(taskIds) ? taskIds : [taskIds];
            
            copiedTasks = [];
            
            // Копируем все выделенные задачи в порядке их следования в массиве tasks
            const sortedTaskIds = tasks
                .filter(t => idsToCopy.includes(t.id))
                .map(t => t.id);
            
            sortedTaskIds.forEach(taskId => {
                const index = tasks.findIndex(t => t.id === taskId);
                if (index === -1) return;
                
                const task = tasks[index];
                // Создаем глубокую копию задачи
                const copiedTask = {
                    stage: task.stage,
                    control: task.control,
                    task: task.task,
                    days: task.days,
                    substage: task.substage || '',
                    status: task.status || 'pending',
                    dateStatuses: task.dateStatuses ? { ...task.dateStatuses } : {},
                    dateComments: task.dateComments ? { ...task.dateComments } : {},
                    link: task.link || '',
                    responsible: task.responsible || '',
                    onTravel: task.onTravel || false
                };
                
                copiedTasks.push(copiedTask);
            });
            
            console.log(\`✅ Скопировано задач: \${copiedTasks.length}\`, copiedTasks);
        }
`;

// 3. Новая функция pasteTask для вставки всех скопированных задач
const newPasteTaskFunction = `
        // Вставка скопированных задач (может быть одна или несколько)
        function pasteTask() {
            if (!canEdit()) {
                return; // Блокируем вставку в режиме просмотра
            }
            
            if (copiedTasks.length === 0) return;
            
            // Сохраняем состояние в историю перед вставкой задач
            addToUndoHistory();
            
            // Определяем, после какой задачи вставлять
            const baseId = getPrimarySelectedTaskId();
            let insertIndex;
            let currentStartDate;
            
            if (baseId !== null) {
                // Вставляем после последней выделенной задачи
                const index = tasks.findIndex(t => t.id === baseId);
                if (index === -1) return;
                insertIndex = index + 1;
                
                const selectedTask = tasks[index];
                if (!selectedTask.endDate) return;
                
                // Дата начала первой новой задачи: следующий рабочий день после конца последней выделенной
                currentStartDate = new Date(selectedTask.endDate);
                do {
                    currentStartDate.setDate(currentStartDate.getDate() + 1);
                } while (!isWorkday(currentStartDate));
            } else {
                // Если нет выбранной задачи, вставляем в конец
                const lastTask = tasks[tasks.length - 1];
                if (!lastTask || !lastTask.endDate) return;
                
                insertIndex = tasks.length;
                
                currentStartDate = new Date(lastTask.endDate);
                do {
                    currentStartDate.setDate(currentStartDate.getDate() + 1);
                } while (!isWorkday(currentStartDate));
            }
            
            // Вставляем все скопированные задачи последовательно
            const insertedTasks = [];
            copiedTasks.forEach((copiedTask, idx) => {
                const newDates = getTaskDates(currentStartDate, copiedTask.days);
                
                const newTask = {
                    id: nextTaskId++,
                    stage: copiedTask.stage,
                    control: copiedTask.control,
                    task: copiedTask.task,
                    days: copiedTask.days,
                    substage: copiedTask.substage,
                    startDate: newDates[0],
                    endDate: newDates[newDates.length - 1],
                    dates: newDates,
                    status: copiedTask.status,
                    dateStatuses: {},
                    dateComments: {},
                    link: copiedTask.link,
                    responsible: copiedTask.responsible,
                    onTravel: copiedTask.onTravel || false
                };
                
                tasks.splice(insertIndex + idx, 0, newTask);
                insertedTasks.push(newTask.id);
                
                // Следующая задача начинается после окончания текущей
                currentStartDate = new Date(newTask.endDate);
                do {
                    currentStartDate.setDate(currentStartDate.getDate() + 1);
                } while (!isWorkday(currentStartDate));
            });
            
            // Пересчитываем все последующие задачи после вставленных
            if (insertedTasks.length > 0) {
                const firstInsertedIndex = tasks.findIndex(t => t.id === insertedTasks[0]);
                recalculateFollowingTasks(firstInsertedIndex + insertedTasks.length - 1);
            }
            
            // Сохраняем текущую позицию прокрутки и активный элемент перед перерисовкой
            const scrollY = window.scrollY || window.pageYOffset;
            const scrollX = window.scrollX || window.pageXOffset;
            
            const chartContainer = document.getElementById('ganttChart');
            const chartScrollTop = chartContainer ? chartContainer.scrollTop : 0;
            const chartScrollLeft = chartContainer ? chartContainer.scrollLeft : 0;
            
            const activeElement = document.activeElement;
            const activeElementInfo = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') 
                ? { element: activeElement, selectionStart: activeElement.selectionStart, selectionEnd: activeElement.selectionEnd }
                : null;
            
            if (activeElementInfo) {
                activeElementInfo.element.blur();
            }

            updateStatistics();
            
            if (searchResults.length > 0) {
                highlightSearchResults();
            }
            renderGantt();
            renderTable();

            window.scrollTo(scrollX, scrollY);
            const newChartContainer = document.getElementById('ganttChart');
            if (newChartContainer) {
                newChartContainer.scrollTop = chartScrollTop;
                newChartContainer.scrollLeft = chartScrollLeft;
            }
            
            if (activeElementInfo && document.contains(activeElementInfo.element)) {
                requestAnimationFrame(() => {
                    activeElementInfo.element.focus();
                    if (activeElementInfo.selectionStart !== undefined) {
                        activeElementInfo.element.setSelectionRange(activeElementInfo.selectionStart, activeElementInfo.selectionEnd);
                    }
                });
            }
            
            // Выделяем вставленные задачи
            selectedTaskIds.clear();
            insertedTasks.forEach(taskId => {
                selectedTaskIds.add(taskId);
            });
            lastSelectedTaskId = insertedTasks[insertedTasks.length - 1];
            highlightSelectedTasks();
        }
`;

// 4. Заменить обработчик Ctrl+C (около строки 25204):
const newCtrlCHandler = `
                // Копирование задач по Ctrl+C (поддержка множественного выделения)
                if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
                    const target = event.target;
                    // Не перехватываем нажатие, если фокус в инпуте/textarea/select (стандартное копирование текста)
                    if (
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLTextAreaElement ||
                        target instanceof HTMLSelectElement ||
                        target.isContentEditable
                    ) {
                        return;
                    }
                    if (!canEdit()) {
                        return; // Блокируем копирование в режиме просмотра
                    }
                    // Копируем все выделенные задачи, если они есть, иначе копируем основную
                    if (selectedTaskIds.size > 0) {
                        event.preventDefault();
                        copyTask(Array.from(selectedTaskIds));
                    } else {
                        const primaryTaskId = getPrimarySelectedTaskId();
                        if (primaryTaskId !== null) {
                            event.preventDefault();
                            copyTask([primaryTaskId]);
                        }
                    }
                    return;
                }
`;

// 5. Заменить обработчик Ctrl+V (около строки 25227):
const newCtrlVHandler = `
                // Вставка задач по Ctrl+V
                if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
                    const target = event.target;
                    // Не перехватываем нажатие, если фокус в инпуте/textarea/select (стандартная вставка текста)
                    if (
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLTextAreaElement ||
                        target instanceof HTMLSelectElement ||
                        target.isContentEditable
                    ) {
                        return;
                    }
                    if (!canEdit()) {
                        return; // Блокируем вставку в режиме просмотра
                    }
                    if (copiedTasks.length > 0) {
                        event.preventDefault();
                        pasteTask();
                    }
                    return;
                }
`;

console.log('Файл с инструкциями создан. Используйте эти функции для замены в implementation_schedule.html');
