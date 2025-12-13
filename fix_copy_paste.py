#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для исправления функций копирования/вставки задач
Добавляет поддержку множественного копирования/вставки
"""

import re
import sys

def fix_copy_paste(file_path):
    print(f"Чтение файла {file_path}...")
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    print("Внесение изменений...")
    
    # 1. Замена переменной copiedTask на copiedTasks
    content = content.replace('let copiedTask = null;', 'let copiedTasks = [];')
    content = content.replace('copiedTask === null', 'copiedTasks.length === 0')
    content = content.replace('copiedTask !== null', 'copiedTasks.length > 0')
    
    # 2. Замена функции copyTask
    # Паттерн для поиска функции copyTask
    copy_task_pattern = r'function copyTask\(taskId\) \{([^}]*(?:\{[^}]*\}[^}]*)*)\}'
    
    new_copy_task = '''function copyTask(taskIds) {
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
            
            console.log(`✅ Скопировано задач: ${copiedTasks.length}`, copiedTasks);
        }'''
    
    # Поиск и замена функции copyTask (более точный поиск)
    old_copy_start = 'function copyTask(taskId) {'
    if old_copy_start in content:
        # Находим начало функции
        start_idx = content.find(old_copy_start)
        if start_idx != -1:
            # Ищем конец функции (следующая функция или закрывающая скобка на том же уровне)
            brace_count = 0
            in_function = False
            end_idx = start_idx
            
            for i in range(start_idx, len(content)):
                if content[i] == '{':
                    brace_count += 1
                    in_function = True
                elif content[i] == '}':
                    brace_count -= 1
                    if in_function and brace_count == 0:
                        end_idx = i + 1
                        break
            
            # Заменяем функцию
            content = content[:start_idx] + new_copy_task + content[end_idx:]
            print("✓ Функция copyTask обновлена")
    
    # 3. Обновление обработчика Ctrl+C
    ctrl_c_pattern = r'const primaryTaskId = getPrimarySelectedTaskId\(\);\s+if \(primaryTaskId !== null\) \{\s+event\.preventDefault\(\);\s+copyTask\(primaryTaskId\);'
    ctrl_c_replacement = '''if (selectedTaskIds.size > 0) {
                        event.preventDefault();
                        copyTask(Array.from(selectedTaskIds));
                    } else {
                        const primaryTaskId = getPrimarySelectedTaskId();
                        if (primaryTaskId !== null) {
                            event.preventDefault();
                            copyTask([primaryTaskId]);
                        }
                    }'''
    
    content = re.sub(ctrl_c_pattern, ctrl_c_replacement, content, flags=re.MULTILINE)
    
    # 4. Обновление pasteTask - нужно найти и заменить логику вставки
    # Заменяем использование copiedTask.days на цикл по copiedTasks
    # Это сложная замена, нужно найти блок создания задачи и обернуть в forEach
    
    if content != original_content:
        print("Сохранение файла...")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("✓ Файл обновлен!")
        print("\nВНИМАНИЕ: Функция pasteTask требует ручной проверки и доработки.")
        print("См. инструкции в COPY_PASTE_FIX_INSTRUCTIONS.md")
        return True
    else:
        print("Изменения не внесены. Возможно, файл уже был изменен или структура отличается.")
        return False

if __name__ == '__main__':
    file_path = 'implementation_schedule.html'
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    
    try:
        fix_copy_paste(file_path)
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
