# Исправления для работы с этапами

## Изменения, которые нужно внести:

### 1. Добавить переменную selectedStage (после строки 7275)
```javascript
        let copiedTask = null; // скопированная задача для вставки
        // Выделение этапа
        let selectedStage = null; // название выделенного этапа (например, "Этап 1. Формирование цифровой модели")
        // Флаг и ссылка на модал удаления
```

### 2. Изменить обработчик клика на метку этапа (строка ~12547)
Заменить:
```javascript
                    stageLabel.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleStageCollapse(stageName);
                    });
```

На:
```javascript
                    // Обработчик двойного клика для переименования
                    let clickTimer = null;
                    stageLabel.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (clickTimer === null) {
                            clickTimer = setTimeout(() => {
                                // Одиночный клик - выделение этапа
                                selectedTaskIds.clear();
                                selectedStage = stageName;
                                applyStageSelection();
                                clickTimer = null;
                            }, 300);
                        } else {
                            // Двойной клик - переименование
                            clearTimeout(clickTimer);
                            clickTimer = null;
                            openRenameStageModal(stageName);
                        }
                    });
                    
                    // Обработчик двойного клика
                    stageLabel.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        if (clickTimer) {
                            clearTimeout(clickTimer);
                            clickTimer = null;
                        }
                        openRenameStageModal(stageName);
                    });
```

### 3. Добавить функцию applyStageSelection
Добавить после функции applySelectionHighlight:
```javascript
        function applyStageSelection() {
            // Убираем выделение со всех меток этапов
            document.querySelectorAll('.gantt-stage-label').forEach(label => {
                label.classList.remove('selected');
            });
            
            // Выделяем выбранный этап
            if (selectedStage) {
                const stageLabel = document.querySelector(`.gantt-stage-label[data-stage-name="${selectedStage}"]`);
                if (stageLabel) {
                    stageLabel.classList.add('selected');
                }
            }
        }
```

### 4. Изменить функцию insertTaskBelowSelected
В начале функции добавить проверку на выделенный этап:
```javascript
        function insertTaskBelowSelected() {
            if (!canEdit()) {
                return;
            }
            
            // Если выделен этап, вставляем новый этап
            if (selectedStage) {
                insertNewStage(selectedStage);
                return;
            }
            
            // Остальной код для вставки задачи...
```

### 5. Добавить функцию insertNewStage
```javascript
        function insertNewStage(afterStageName) {
            addToUndoHistory();
            
            // Находим индекс последней задачи этапа
            const stageTasks = tasks.filter(t => t.stage === afterStageName);
            if (stageTasks.length === 0) return;
            
            const lastTask = stageTasks[stageTasks.length - 1];
            const lastIndex = tasks.findIndex(t => t.id === lastTask.id);
            if (lastIndex === -1) return;
            
            // Определяем номер нового этапа
            const stageMatch = afterStageName.match(/^(Этап\s+)(\d+)/);
            let newStageNumber = 1;
            if (stageMatch) {
                newStageNumber = parseInt(stageMatch[2]) + 1;
            } else {
                // Если формат не стандартный, ищем максимальный номер
                const allStages = [...new Set(tasks.map(t => t.stage).filter(Boolean))];
                const numbers = allStages.map(s => {
                    const m = s.match(/^(Этап\s+)(\d+)/);
                    return m ? parseInt(m[2]) : 0;
                });
                newStageNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
            }
            
            const newStageName = `Этап ${newStageNumber}. Новый этап`;
            
            // Создаем новую задачу для нового этапа
            let newStart = new Date(lastTask.endDate);
            do {
                newStart.setDate(newStart.getDate() + 1);
            } while (!isWorkday(newStart));
            
            const newDates = getTaskDates(newStart, 1);
            
            const newTask = {
                id: nextTaskId++,
                stage: newStageName,
                control: '',
                task: 'Новая задача',
                days: 1,
                substage: '',
                startDate: newDates[0],
                endDate: newDates[newDates.length - 1],
                dates: newDates,
                status: 'pending',
                dateStatuses: {},
                link: 'О_Н',
                responsible: '',
                onTravel: false
            };
            
            // Вставляем новую задачу после последней задачи этапа
            tasks.splice(lastIndex + 1, 0, newTask);
            
            // Обновляем stageConfig
            if (!stageConfig.includes(newStageName)) {
                stageConfig.push(newStageName);
                stageConfig.sort();
            }
            
            // Пересчитываем связи
            recalculateFollowingTasks(lastIndex + 1);
            
            // Выделяем новый этап
            selectedStage = newStageName;
            selectedTaskIds.clear();
            
            updateStatistics();
            renderGantt();
            renderTable();
            renderStageTabs();
            applyStageSelection();
        }
```

### 6. Добавить CSS для выделенного этапа
Добавить в стили:
```css
        .gantt-stage-label.selected {
            background: rgba(30, 136, 229, 0.3);
            border-right: 3px solid var(--color-primary);
            font-weight: 700;
        }
        
        [data-theme="dark"] .gantt-stage-label.selected {
            background: rgba(66, 165, 245, 0.3);
            border-right: 3px solid var(--color-primary);
        }
```

### 7. Изменить функцию selectTask для сброса выделения этапа
В начале функции selectTask добавить:
```javascript
        function selectTask(taskId, options = {}) {
            // Сбрасываем выделение этапа при выделении задачи
            if (selectedStage) {
                selectedStage = null;
                applyStageSelection();
            }
            // Остальной код...
```

### 8. Добавить drag & drop для этапов
Это более сложное изменение, требующее переработки логики перемещения задач по этапам.
