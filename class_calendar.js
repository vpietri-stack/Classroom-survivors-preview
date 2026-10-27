/* Dashboard calendar UI. All writes use the privileged classCalendar endpoint. */
let calendarEvents = [];
let calendarReady = false;
let calendarLoadSeq = 0;
let calendarEditingId = null;
let attendanceUnchecked = new Set();
let attendanceSaving = false;
let attendanceReady = true;
let calendarRevision = '';
let calendarRevisionRange = '';

function calendarFormat(value) {
    return new Date(value).toLocaleString('en-GB', {timeZone:'Asia/Shanghai',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function calendarClock(value) { return ClassCalendarCore.localInput(value).slice(11); }
function calendarMatchesFilters(event) {
    const teacher = document.getElementById('filterTeacher').value;
    const classTime = document.getElementById('filterClassTime').value;
    return (!teacher || event.teacher === teacher) && (!classTime || event.classTime === classTime);
}
function pendingAttendance() {
    return calendarEvents.filter(e => e.status === 'scheduled' && +new Date(e.endTime) <= Date.now() && calendarMatchesFilters(e))
        .flatMap(event => event.studentIds.map(id => ({event,student:allStudents.find(s => s.id === id)})))
        .filter(r => r.student && !(r.student.attendance || []).some(a => a.classId === r.event.id))
        .sort((a,b) => a.event.startTime.localeCompare(b.event.startTime) || (a.student.fullName || a.student.id).localeCompare(b.student.fullName || b.student.id));
}
function attendanceKey(eventId, studentId) { return JSON.stringify([eventId,studentId]); }
async function calendarRequest(body) {
    const res = await apiFetch(`${API_BASE}/classCalendar`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
async function loadClassCalendar() {
    const monthInput = document.getElementById('calendarMonth');
    if (!monthInput) return;
    if (!monthInput.value) monthInput.value = ClassCalendarCore.beijingDate(Date.now()).slice(0,7);
    const seq = ++calendarLoadSeq;
    const message = document.getElementById('calendarMessage');
    message.textContent = 'Loading classes…';
    try {
        const [year,month] = monthInput.value.split('-').map(Number);
        const through = new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
        const range = `${year}-${String(month).padStart(2,'0')}-01`;
        const params = new URLSearchParams({from:range,through});
        if (calendarRevision && calendarRevisionRange === range) params.set('since',calendarRevision);
        const res = await apiFetch(`${API_BASE}/classCalendar?${params}`,{cache:'no-store'});
        if (seq !== calendarLoadSeq) return false;
        if (res.status === 304) {message.textContent=''; renderClassCalendar(); return true;}
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (seq !== calendarLoadSeq) return;
        calendarEvents = data.events;
        calendarRevision = data.revision || ''; calendarRevisionRange = range;
        calendarReady = true;
        const unparsed = [...new Set(allStudents.flatMap(s => ClassCalendarCore.memberships(s).map(g => g.classTime)).filter(t => t && !ClassCalendarCore.parseClassTime(t)))];
        message.textContent = unparsed.length ? `These class times need a weekday and time (for example Sun 16:30): ${unparsed.join(', ')}` : '';
        renderClassCalendar();
        applyFilters();
        if (currentStudent) renderStudentAttendance();
        return true;
    } catch (err) {
        if (seq !== calendarLoadSeq) return;
        message.textContent = `Unable to load calendar: ${err.message}`;
        if (!calendarReady) document.getElementById('classCalendarGrid').replaceChildren();
        return false;
    }
}
function toggleClassCalendar() {
    document.getElementById('classCalendarPanel').classList.toggle('hidden');
    if (!calendarReady) loadClassCalendar();
}
function changeCalendarMonth(delta) {
    const input = document.getElementById('calendarMonth');
    const [year,month] = input.value.split('-').map(Number);
    const next = new Date(Date.UTC(year,month-1+delta,1)).toISOString().slice(0,7);
    if (next < '2026-10') return;
    input.value = next;
    loadClassCalendar();
}
function renderClassCalendar() {
    const mount = document.getElementById('classCalendarGrid');
    if (!mount || !calendarReady) return;
    const month = document.getElementById('calendarMonth').value;
    const [year,num] = month.split('-').map(Number);
    const offset = (new Date(Date.UTC(year,num-1,1)).getUTCDay()+6)%7;
    const days = new Date(Date.UTC(year,num,0)).getUTCDate();
    const today = ClassCalendarCore.beijingDate(Date.now());
    const filtered = calendarEvents.filter(e => e.status !== 'retired' && calendarMatchesFilters(e));
    const titles = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let html = titles.map(d => `<div class="calendar-weekday">${d}</div>`).join('');
    for (let i=0;i<offset;i++) html += '<div class="calendar-day calendar-empty"></div>';
    for (let day=1;day<=days;day++) {
        const date = `${month}-${String(day).padStart(2,'0')}`;
        const events = filtered.filter(e => ClassCalendarCore.beijingDate(e.startTime) === date);
        html += `<div class="calendar-day ${date === today ? 'calendar-today' : ''}"><span class="calendar-day-label">${day}</span>`;
        for (const e of events) {
            const recorded = e.studentIds.filter(id => allStudents.find(s => s.id === id)?.attendance?.some(a => a.classId === e.id && a.status !== 'cancelled')).length;
            html += `<button class="calendar-event ${e.status === 'cancelled' ? 'calendar-cancelled' : ''}" data-class-id="${_esc(e.id)}">
                <strong>${calendarClock(e.startTime)}–${calendarClock(e.endTime)}</strong><span>${_esc(e.classTime)}</span><span>${_esc(e.teacher) || 'No teacher'}</span>
                <small>${e.status === 'cancelled' ? 'Cancelled' : `${recorded}/${e.studentIds.length} recorded`}${e.manual ? ' · edited' : ''}</small></button>`;
        }
        html += '</div>';
    }
    mount.innerHTML = html;
    mount.querySelectorAll('[data-class-id]').forEach(button => button.addEventListener('click',() => openCalendarEdit(button.dataset.classId)));
    document.getElementById('attendancePendingCount').textContent = `(${pendingAttendance().length})`;
}
async function openAttendanceChecklist() {
    attendanceUnchecked = new Set();
    attendanceReady = false;
    document.getElementById('attendanceModal').classList.remove('hidden');
    document.getElementById('attendanceMessage').textContent = 'Refreshing attendance…';
    // Fresh roster prevents displaying receipts saved from another dashboard/device.
    renderAttendanceChecklist();
    attendanceReady = await refreshDashboardData();
    document.getElementById('attendanceMessage').textContent = attendanceReady && calendarReady ? '' : 'Attendance could not refresh. Close this window and retry.';
    renderAttendanceChecklist();
}
function renderAttendanceChecklist() {
    const mount = document.getElementById('attendanceChecklist');
    const rows = calendarReady && attendanceReady ? pendingAttendance() : [];
    let groupId = null;
    mount.replaceChildren();
    if (!rows.length) mount.textContent = !attendanceReady ? 'Waiting for fresh attendance data…' : calendarReady ? 'All completed classes have attendance recorded for these filters.' : 'Attendance could not be loaded.';
    for (const {event,student} of rows) {
        if (event.id !== groupId) {
            const title = document.createElement('h3');
            title.className = 'attendance-class-heading';
            title.textContent = `${calendarFormat(event.startTime)}–${calendarClock(event.endTime)} · ${event.classTime}${event.teacher ? ' · '+event.teacher : ''}`;
            mount.appendChild(title);
            groupId = event.id;
        }
        const label = document.createElement('label');
        label.className = 'attendance-check-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        const key = attendanceKey(event.id,student.id);
        input.checked = !attendanceUnchecked.has(key);
        input.disabled = attendanceSaving;
        input.addEventListener('change',() => { if (input.checked) attendanceUnchecked.delete(key); else attendanceUnchecked.add(key); });
        label.append(input,document.createTextNode(` ${student.avatar || '👤'} ${student.fullName || student.login || student.id}`));
        mount.appendChild(label);
    }
    ['attendanceAttendedBtn','attendanceMissedBtn'].forEach(id => { document.getElementById(id).disabled = attendanceSaving || !rows.length; });
}
function selectAttendance(checked) {
    if (attendanceSaving) return;
    pendingAttendance().forEach(({event,student}) => { const key = attendanceKey(event.id,student.id); if (checked) attendanceUnchecked.delete(key); else attendanceUnchecked.add(key); });
    renderAttendanceChecklist();
}
function applyAttendanceResults(results) {
    for (const result of results || []) {
        if (!result.success) continue;
        const student = allStudents.find(s => s.id === result.studentId);
        if (student) { student.attendance = result.attendance; student.targets = result.targets; student.targetCounts={...student.targetCounts,...result.targetCounts}; delete student._groupProgress; }
    }
    applyFilters();
    if (currentStudent) renderStudentAttendance();
}
async function saveCheckedAttendance(status) {
    if (attendanceSaving || !calendarReady || !attendanceReady) return;
    const rows = pendingAttendance().filter(({event,student}) => !attendanceUnchecked.has(attendanceKey(event.id,student.id)));
    const message = document.getElementById('attendanceMessage');
    if (!rows.length) { message.textContent = 'Select at least one student.'; return; }
    attendanceSaving = true;
    renderAttendanceChecklist();
    message.textContent = 'Saving attendance and updating targets…';
    const failures = [];
    try {
        const groups = new Map();
        for (const row of rows) { if (!groups.has(row.event.id)) groups.set(row.event.id,[]); groups.get(row.event.id).push(row.student.id); }
        for (const [eventId,studentIds] of groups) {
            const result = await calendarRequest({action:'record',eventId,studentIds,status});
            applyCalendarEvent(result.event);
            const event = calendarEvents.find(e => e.id === eventId);
            if (event) event.attendanceStarted = true;
            applyAttendanceResults(result.results);
            failures.push(...result.results.filter(r => !r.success).map(r => `${allStudents.find(s => s.id === r.studentId)?.fullName || r.studentId}: ${r.error}`));
            renderAttendanceChecklist();
        }
        message.textContent = failures.length ? failures.join(' · ') : 'Attendance saved. Targets updated.';
    } catch (err) { message.textContent = `Save failed: ${err.message} Already saved students remain recorded; retry the remaining students.`; }
    finally { attendanceSaving = false; renderAttendanceChecklist(); }
}
function openCalendarEdit(id) {
    const event = calendarEvents.find(e => e.id === id);
    if (!event) return;
    calendarEditingId = id;
    document.getElementById('calendarEditTitle').textContent = `${event.classTime} · ${event.teacher || 'No teacher'}`;
    document.getElementById('calendarEditStart').value = ClassCalendarCore.localInput(event.startTime);
    document.getElementById('calendarEditEnd').value = ClassCalendarCore.localInput(event.endTime);
    const locked = !!event.attendanceStarted || event.status === 'cancelled';
    ['calendarEditStart','calendarEditEnd','calendarSaveBtn'].forEach(id => { document.getElementById(id).disabled = locked; });
    document.getElementById('calendarCancelBtn').disabled = locked && event.status !== 'cancelled';
    document.getElementById('calendarCancelBtn').textContent = event.status === 'cancelled' ? 'Retry unfinished target extensions' : 'Cancel class · extend targets';
    document.getElementById('calendarEditInfo').textContent = locked ? 'This class is locked because attendance or cancellation has started.' : 'Rescheduling changes this class only. Cancelling adds 10 sessions to each student’s existing target and extends its period by seven days.';
    document.getElementById('calendarEditMessage').textContent = '';
    document.getElementById('calendarEditModal').classList.remove('hidden');
}
async function saveCalendarEdit(cancel) {
    const event = calendarEvents.find(e => e.id === calendarEditingId);
    if (!event) return;
    const message = document.getElementById('calendarEditMessage');
    const save = document.getElementById('calendarSaveBtn'), cancelBtn = document.getElementById('calendarCancelBtn');
    if ((cancel ? cancelBtn : save).disabled) return;
    save.disabled = cancelBtn.disabled = true;
    message.textContent = cancel ? 'Cancelling and extending targets…' : 'Saving class…';
    try {
        const body = cancel ? {action:'cancel',eventId:event.id} : {action:'edit',eventId:event.id,etag:event.etag,startTime:ClassCalendarCore.iso(document.getElementById('calendarEditStart').value),endTime:ClassCalendarCore.iso(document.getElementById('calendarEditEnd').value)};
        const result = await calendarRequest(body);
        if (result.results) applyAttendanceResults(result.results);
        applyCalendarEvent(result.event);
        const failed = (result.results || []).filter(r => !r.success);
        if (failed.length) throw new Error(failed.map(r => r.error).join(' · '));
        closeModal('calendarEditModal');
    } catch (err) { message.textContent = err.message; }
    finally {
        const latest = calendarEvents.find(e => e.id === event.id);
        save.disabled = !!latest?.attendanceStarted || latest?.status === 'cancelled';
        cancelBtn.disabled = !!latest?.attendanceStarted && latest?.status !== 'cancelled';
    }
}
function applyCalendarEvent(event) {
    if (!event) return;
    const index = calendarEvents.findIndex(e=>e.id === event.id);
    if (index < 0) calendarEvents.push(event); else calendarEvents[index] = event;
    calendarRevision = '';
    renderClassCalendar();
}
function attendanceRateCell(student,from,to) {
    const stats = ClassCalendarCore.attendanceStats(student,from,to);
    return stats.rate === null ? '<span class="calendar-subtitle">No records</span>' : `<strong>${stats.rate}%</strong> <span class="calendar-subtitle">${stats.attended}/${stats.recorded}</span>`;
}
function renderStudentAttendance() {
    if (!currentStudent) return;
    const from = document.getElementById('detailDateFrom').value, to = document.getElementById('detailDateTo').value;
    const stats = ClassCalendarCore.attendanceStats(currentStudent,from,to);
    const pending = calendarEvents.filter(e => e.status === 'scheduled' && +new Date(e.endTime) <= Date.now() && e.studentIds.includes(currentStudent.id) && !(currentStudent.attendance || []).some(a => a.classId === e.id) && (!from || ClassCalendarCore.beijingDate(e.startTime) >= from) && (!to || ClassCalendarCore.beijingDate(e.startTime) <= to));
    document.getElementById('studentAttendanceSummary').textContent = `${stats.rate === null ? 'No recorded attendance' : stats.rate+'% attendance · '+stats.attended+' attended / '+stats.recorded+' recorded classes'} · ${pending.length} awaiting attendance. Rates use recorded classes; cancelled classes are excluded.`;
    const rows = stats.records.map(r => ({...r})).concat(pending.map(e => ({...e,status:'pending'}))).sort((a,b) => b.startTime.localeCompare(a.startTime));
    document.getElementById('studentAttendanceBody').innerHTML = rows.length ? rows.map(r => `<tr><td>${calendarFormat(r.startTime)}–${calendarClock(r.endTime)}</td><td>${_esc(r.classTime)}</td><td>${r.status === 'attended' ? '✓ Attended' : r.status === 'missed' ? '✗ Missed' : 'Awaiting attendance'}</td></tr>`).join('') : '<tr><td colspan="3">No classes recorded in this period.</td></tr>';
}
