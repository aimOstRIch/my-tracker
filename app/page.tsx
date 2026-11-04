'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client' 
import { useRouter } from 'next/navigation'

export default function TrackerPage() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'notes' | 'events'>('notes')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  // --- ТЕМА ---
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // --- ДАТЫ ---
  const [currentDate, setCurrentDate] = useState<Date | null>(null)
  const [today, setToday] = useState<Date | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // --- ЗАМЕТКИ ---
  const [notes, setNotes] = useState<any[]>([])
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteTags, setNoteTags] = useState('') // Строка для ввода тегов
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // --- РЕДАКТИРОВАНИЕ И ПОИСК ---
  const [editingId, setEditingId] = useState<string | null>(null) // ID заметки, которую редактируем
  const [searchQuery, setSearchQuery] = useState('')

  // --- КАЛЕНДАРЬ ---
  const [events, setEvents] = useState<any[]>([])
  const [eventTitle, setEventTitle] = useState('')
  const [eventDesc, setEventDesc] = useState('')
  const [eventTime, setEventTime] = useState('12:00')
  const [isSavingEvent, setIsSavingEvent] = useState(false)

  // --- ЗАГРУЗКА ---
  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: notesData } = await supabase.from('notes').select('*, attachments(*)').order('created_at', { ascending: false })
    if (notesData) setNotes(notesData)

    const { data: eventsData } = await supabase.from('events').select('*').order('start_time', { ascending: true })
    if (eventsData) setEvents(eventsData)

    setLoading(false)
  }

  useEffect(() => {
    setMounted(true)
    const now = new Date()
    setCurrentDate(now)
    setToday(now)

    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = saved || (prefersDark ? 'dark' : 'light')
    setTheme(initial)
    document.documentElement.classList.toggle('dark', initial === 'dark')

    fetchData()
  }, [])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  // --- ДЕЙСТВИЯ С ЗАМЕТКАМИ ---
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteTitle && !noteContent && !file) return
    setIsUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Парсим теги из строки в массив (убираем пробелы, пустые значения)
    const tagsArray = noteTags.split(',').map(t => t.trim()).filter(t => t !== '')

    if (editingId) {
      // РЕЖИМ РЕДАКТИРОВАНИЯ
      const { error } = await supabase.from('notes').update({
        title: noteTitle,
        content: noteContent,
        tags: tagsArray
      }).eq('id', editingId)

      if (error) { alert('Ошибка: ' + error.message); setIsUploading(false); return }
      
      // Если при редактировании прикрепили новый файл
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${user.id}/${fileName}`
        const { error: uploadError } = await supabase.storage.from('uploads').upload(filePath, file)
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath)
          await supabase.from('attachments').insert([{ note_id: editingId, user_id: user.id, file_url: urlData.publicUrl, file_type: file.type.startsWith('video') ? 'video' : 'photo' }])
        }
      }
    } else {
      // РЕЖИМ СОЗДАНИЯ
      const { data: newNote, error } = await supabase.from('notes').insert([{ 
        title: noteTitle, content: noteContent, tags: tagsArray, user_id: user.id 
      }]).select().single()
      
      if (error) { alert('Ошибка: ' + error.message); setIsUploading(false); return }

      if (file && newNote) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${user.id}/${fileName}`
        const { error: uploadError } = await supabase.storage.from('uploads').upload(filePath, file)
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath)
          await supabase.from('attachments').insert([{ note_id: newNote.id, user_id: user.id, file_url: urlData.publicUrl, file_type: file.type.startsWith('video') ? 'video' : 'photo' }])
        }
      }
    }
    
    resetNoteForm()
    fetchData()
  }

  const resetNoteForm = () => {
    setNoteTitle(''); setNoteContent(''); setNoteTags(''); setFile(null); setEditingId(null); setIsUploading(false);
  }

  const startEdit = (note: any) => {
    setNoteTitle(note.title || '')
    setNoteContent(note.content || '')
    setNoteTags(note.tags ? note.tags.join(', ') : '')
    setEditingId(note.id)
    window.scrollTo({ top: 0, behavior: 'smooth' }) // Скроллим к форме
  }

  const deleteNote = async (id: string) => {
    if(!confirm('Удалить заметку?')) return
    await supabase.from('notes').delete().eq('id', id)
    if (editingId === id) resetNoteForm()
    fetchData()
  }

  // --- ЛОГИКА КАЛЕНДАРЯ ---
  const changeMonth = (offset: number) => {
    if (!currentDate) return
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))
    setSelectedDate(null)
  }

  const handleDayClick = (day: number) => {
    if (!currentDate) return
    setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))
    setEventTitle(''); setEventDesc(''); setEventTime('12:00')
  }

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventTitle || !selectedDate) return
    setIsSavingEvent(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [hours, minutes] = eventTime.split(':')
    const startTime = new Date(selectedDate)
    startTime.setHours(parseInt(hours), parseInt(minutes))

    const { error } = await supabase.from('events').insert([{ title: eventTitle, description: eventDesc, start_time: startTime.toISOString(), user_id: user.id }])
    if (error) alert('Ошибка: ' + error.message)
    else { setEventTitle(''); setEventDesc(''); setEventTime('12:00'); fetchData() }
    setIsSavingEvent(false)
  }

  const deleteEvent = async (id: string) => {
    await supabase.from('events').delete().eq('id', id)
    fetchData()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (!mounted || loading || !currentDate || !today) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#667eea]">
        <div className="text-white text-xl font-semibold animate-pulse">Загрузка...</div>
      </div>
    )
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const startDayOffset = firstDayOfMonth === 0 ? 6 : firstDayOffset(day => day) - 1 // Хак для TS, просто firstDayOfMonth - 1

  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

  const getEventsForDay = (day: number) => events.filter(e => {
    const d = new Date(e.start_time)
    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year
  })

  // Фильтрация заметок по поиску
  const filteredNotes = notes.filter(note => {
    const query = searchQuery.toLowerCase()
    return (
      (note.title || '').toLowerCase().includes(query) ||
      (note.content || '').toLowerCase().includes(query) ||
      (note.tags || []).some((t: string) => t.toLowerCase().includes(query))
    )
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-[#1a202c] dark:to-[#2d3748] p-4 md:p-6 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">

        {/* Шапка */}
        <header className="bg-white/95 dark:bg-[#2d3748]/95 backdrop-blur rounded-2xl shadow-lg px-6 py-4 mb-6 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl md:text-2xl font-bold text-[#4c51bf] dark:text-[#818cf8]">📔 Мой трекер</h1>
            <div className="flex gap-2">
              <button onClick={() => setActiveTab('notes')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'notes' ? 'bg-[#4c51bf] text-white shadow-md' : 'bg-[#edf2f7] dark:bg-[#3a4252] text-[#4a5568] dark:text-[#cbd5e0] hover:bg-[#e2e8f0] dark:hover:bg-[#4a5568]'}`}>Заметки</button>
              <button onClick={() => setActiveTab('events')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'events' ? 'bg-[#4c51bf] text-white shadow-md' : 'bg-[#edf2f7] dark:bg-[#3a4252] text-[#4a5568] dark:text-[#cbd5e0] hover:bg-[#e2e8f0] dark:hover:bg-[#4a5568]'}`}>Календарь</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="px-3 py-2 rounded-xl bg-[#edf2f7] dark:bg-[#3a4252] text-sm font-semibold transition hover:bg-[#e2e8f0] dark:hover:bg-[#4a5568]">{theme === 'light' ? '🌙 Тёмная' : '☀️ Светлая'}</button>
            <button onClick={handleLogout} className="text-sm text-[#c53030] dark:text-[#fc8181] font-semibold hover:underline px-2">Выйти</button>
          </div>
        </header>

        {/* ================= ЗАМЕТКИ ================= */}
        {activeTab === 'notes' && (
          <div>
            {/* Форма (Создание / Редактирование) */}
            <form onSubmit={handleSaveNote} className={`bg-white/95 dark:bg-[#2d3748]/95 backdrop-blur rounded-2xl shadow-lg p-6 mb-6 border-2 transition-colors ${editingId ? 'border-[#667eea]' : 'border-transparent'}`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-[#2d3748] dark:text-[#e2e8f0]">
                  {editingId ? '📝 Редактирование заметки' : '✏️ Новая заметка'}
                </h2>
                {editingId && (
                  <button type="button" onClick={resetNoteForm} className="text-sm text-[#c53030] hover:underline">Отменить</button>
                )}
              </div>
              
              <input type="text" placeholder="Заголовок..." value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} className="w-full p-3 mb-3 rounded-xl border-2 border-[#e2e8f0] dark:border-[#4a5568] bg-[#f7fafc] dark:bg-[#252d3a] text-[#2d3748] dark:text-[#e2e8f0] focus:outline-none focus:border-[#667eea] transition" />
              <textarea placeholder="Текст заметки..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className="w-full p-3 mb-3 rounded-xl border-2 border-[#e2e8f0] dark:border-[#4a5568] bg-[#f7fafc] dark:bg-[#252d3a] text-[#2d3748] dark:text-[#e2e8f0] h-24 resize-none focus:outline-none focus:border-[#667eea] transition" />
              
              {/* Поле для тегов */}
              <input type="text" placeholder="Теги (через запятую, например: работа, идеи, спорт)" value={noteTags} onChange={(e) => setNoteTags(e.target.value)} className="w-full p-3 mb-3 rounded-xl border-2 border-[#e2e8f0] dark:border-[#4a5568] bg-[#f7fafc] dark:bg-[#252d3a] text-[#2d3748] dark:text-[#e2e8f0] focus:outline-none focus:border-[#667eea] transition text-sm" />
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-[#718096] dark:text-[#a0aec0] mb-1">Прикрепить новый файл (при редактировании добавится к старым)</label>
                <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-[#718096] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#edf2f7] dark:file:bg-[#3a4252] file:text-[#4c51bf] dark:file:text-[#818cf8] hover:file:bg-[#e2e8f0] dark:hover:file:bg-[#4a5568]" />
              </div>
              <button type="submit" disabled={isUploading} className={`${editingId ? 'bg-[#667eea]' : 'bg-[#4c51bf]'} hover:bg-[#764ba2] text-white px-6 py-2.5 rounded-xl font-semibold transition disabled:opacity-50 shadow-sm`}>
                {isUploading ? 'Сохранение...' : editingId ? 'Обновить заметку' : 'Сохранить'}
              </button>
            </form>

            {/* Панель поиска */}
            <div className="relative mb-6">
              <span className="absolute left-4 top-3.5 text-[#a0aec0]">🔍</span>
              <input 
                type="text" 
                placeholder="Поиск по заголовку, тексту или тегам..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-transparent bg-white/95 dark:bg-[#2d3748]/95 backdrop-blur shadow-lg text-[#2d3748] dark:text-[#e2e8f0] focus:outline-none focus:border-[#667eea] transition"
              />
            </div>

            {/* Сетка заметок (Masonry) */}
            {filteredNotes.length === 0 ? (
              <div className="bg-white/95 dark:bg-[#2d3748]/95 rounded-2xl shadow-lg p-10 text-center text-[#a0aec0] italic">Ничего не найдено (или заметок пока нет)</div>
            ) : (
              <div className="columns-1 md:columns-2 lg:columns-3 gap-5 space-y-5">
                {filteredNotes.map((note) => (
                  <div key={note.id} className="break-inside-avoid bg-white/95 dark:bg-[#2d3748]/95 backdrop-blur rounded-2xl shadow-lg p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group">
                    
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="font-bold text-lg text-[#2d3748] dark:text-[#e2e8f0] pr-2">{note.title || 'Без названия'}</h2>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(note)} title="Редактировать" className="text-[#a0aec0] hover:text-[#4c51bf] transition">✏️</button>
                        <button onClick={() => deleteNote(note.id)} title="Удалить" className="text-[#a0aec0] hover:text-[#c53030] transition">✕</button>
                      </div>
                    </div>

                    {/* Бейджики тегов */}
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {note.tags.map((tag: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-[#edf2f7] dark:bg-[#3a4252] text-[#4c51bf] dark:text-[#818cf8] text-xs font-semibold rounded-md border border-[#e2e8f0] dark:border-[#4a5568]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-[#4a5568] dark:text-[#cbd5e0] whitespace-pre-wrap mb-4 text-sm">{note.content}</p>
                    
                    {note.attachments?.length > 0 && (
                      <div className="grid gap-3 mb-3">
                        {note.attachments.map((att: any) => (
                          <div key={att.id} className="rounded-xl overflow-hidden border border-[#e2e8f0] dark:border-[#4a5568]">
                            {att.file_type === 'video'
                              ? <video src={att.file_url} controls className="w-full bg-black" />
                              : <img src={att.file_url} alt="Вложение" className="w-full object-cover" />}
                          </div>
                        ))}
                      </div>
                    )}
                    <span className="text-xs text-[#a0aec0] block mt-2">{new Date(note.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= КАЛЕНДАРЬ ================= */}
        {activeTab === 'events' && (
          <div className="flex flex-col xl:flex-row gap-6 items-start">
            {/* Календарь */}
            <div className="flex-1 min-w-0 w-full">
              <div className="bg-white/95 dark:bg-[#2d3748]/95 backdrop-blur rounded-2xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                  <button onClick={() => changeMonth(-1)} className="px-4 py-2 rounded-xl bg-[#edf2f7] dark:bg-[#3a4252] text-[#4a5568] dark:text-[#cbd5e0] hover:bg-[#e2e8f0] dark:hover:bg-[#4a5568] transition font-semibold">&larr; Пред.</button>
                  <h2 className="text-xl font-bold text-[#2d3748] dark:text-[#e2e8f0]">{monthNames[month]} {year}</h2>
                  <button onClick={() => changeMonth(1)} className="px-4 py-2 rounded-xl bg-[#edf2f7] dark:bg-[#3a4252] text-[#4a5568] dark:text-[#cbd5e0] hover:bg-[#e2e8f0] dark:hover:bg-[#4a5568] transition font-semibold">След. &rarr;</button>
                </div>

                <div className="grid grid-cols-7 gap-1 md:gap-2 text-center">
                  {weekDays.map(day => (
                    <div key={day} className="font-semibold text-sm text-[#718096] dark:text-[#a0aec0] py-2">{day}</div>
                  ))}
                  {Array.from({ length: startDayOffset }).map((_, i) => (
                    <div key={`empty-${i}`} className="p-2 md:p-4"></div>
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dayEvents = getEventsForDay(day)
                    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                    const isSelected = selectedDate?.getDate() === day && selectedDate?.getMonth() === month && selectedDate?.getFullYear() === year

                    return (
                      <div key={day} onClick={() => handleDayClick(day)} className={`relative min-h-[60px] md:min-h-[80px] p-1 md:p-2 border rounded-xl cursor-pointer transition flex flex-col items-center ${isToday ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'border-[#e2e8f0] dark:border-[#4a5568]'} ${isSelected ? 'ring-2 ring-[#4c51bf] border-transparent' : 'hover:border-[#667eea] hover:shadow-sm'}`}>
                        <span className={`text-sm font-medium ${isToday ? 'text-[#4c51bf] dark:text-[#818cf8] bg-blue-100 dark:bg-blue-900 rounded-full w-6 h-6 flex items-center justify-center' : 'text-[#4a5568] dark:text-[#cbd5e0]'}`}>{day}</span>
                        <div className="flex gap-1 mt-auto flex-wrap justify-center w-full">
                          {dayEvents.slice(0, 3).map(e => (<div key={e.id} className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[#4c51bf] dark:bg-[#818cf8]"></div>))}
                          {dayEvents.length > 3 && <span className="text-[10px] text-[#a0aec0]">+{dayEvents.length - 3}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Панель событий */}
            {selectedDate && (
              <div className="w-full xl:w-[340px] flex-shrink-0">
                <div className="bg-white/95 dark:bg-[#2d3748]/95 backdrop-blur rounded-2xl shadow-lg p-5">
                  <div className="flex justify-between items-start mb-4 border-b border-[#e2e8f0] dark:border-[#4a5568] pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#2d3748] dark:text-[#e2e8f0]">{selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</h3>
                      <p className="text-xs text-[#a0aec0] capitalize">{selectedDate.toLocaleDateString('ru-RU', { weekday: 'long' })}</p>
                    </div>
                    <button onClick={() => setSelectedDate(null)} className="text-[#a0aec0] hover:text-[#c53030] text-xl leading-none transition" title="Закрыть">✕</button>
                  </div>

                  <div className="mb-5 space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {getEventsForDay(selectedDate.getDate()).length === 0 ? (
                      <p className="text-sm text-[#a0aec0] italic text-center py-4">Нет событий</p>
                    ) : (
                      getEventsForDay(selectedDate.getDate()).map((e: any) => (
                        <div key={e.id} className="bg-[#f7fafc] dark:bg-[#252d3a] p-3 rounded-xl border border-[#e2e8f0] dark:border-[#4a5568] text-sm">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-[#4c51bf] dark:text-[#818cf8]">{new Date(e.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                            <button onClick={() => deleteEvent(e.id)} className="text-[#a0aec0] hover:text-[#c53030] text-xs transition">Удалить</button>
                          </div>
                          <p className="font-semibold text-[#2d3748] dark:text-[#e2e8f0]">{e.title}</p>
                          {e.description && <p className="text-[#718096] dark:text-[#a0aec0] mt-1 text-xs">{e.description}</p>}
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={saveEvent} className="border-t border-[#e2e8f0] dark:border-[#4a5568] pt-4">
                    <h4 className="font-semibold text-sm text-[#2d3748] dark:text-[#e2e8f0] mb-3">Добавить событие</h4>
                    <input type="text" placeholder="Название..." value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} className="w-full p-2.5 mb-2 rounded-xl border-2 border-[#e2e8f0] dark:border-[#4a5568] bg-[#f7fafc] dark:bg-[#252d3a] text-[#2d3748] dark:text-[#e2e8f0] text-sm focus:outline-none focus:border-[#667eea] transition" required />
                    <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="w-full p-2.5 mb-2 rounded-xl border-2 border-[#e2e8f0] dark:border-[#4a5568] bg-[#f7fafc] dark:bg-[#252d3a] text-[#2d3748] dark:text-[#e2e8f0] text-sm focus:outline-none focus:border-[#667eea] transition" required />
                    <textarea placeholder="Описание (необязательно)..." value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} className="w-full p-2.5 mb-3 rounded-xl border-2 border-[#e2e8f0] dark:border-[#4a5568] bg-[#f7fafc] dark:bg-[#252d3a] text-[#2d3748] dark:text-[#e2e8f0] text-sm h-16 resize-none focus:outline-none focus:border-[#667eea] transition" />
                    <button type="submit" disabled={isSavingEvent} className="w-full bg-[#4c51bf] hover:bg-[#667eea] text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50 shadow-sm">{isSavingEvent ? 'Сохранение...' : 'Сохранить'}</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}