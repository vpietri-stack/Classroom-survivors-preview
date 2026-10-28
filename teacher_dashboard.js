// ============================================================
// TEACHER DASHBOARD - JavaScript Logic
// ============================================================

// API_BASE is defined in frontend_auth.js (loaded before this script)

let allStudents = [];        // Raw student data from DB
let filteredStudents = [];   // After applying filters
let currentStudent = null;   // Currently selected student for detail view
let sortState = { column: 'name', direction: 'asc' };
let exerciseSortState = { column: 'timestamp', direction: 'desc' };
let isBM = false;            // Flag for Branch Manager role
let dashboardRefreshPromise = null;
let dashboardDataRevision = '';
let studentDetailSequence = 0;

// ----- INIT -----

document.addEventListener('DOMContentLoaded', () => {
    checkTeacherAuth();
});

async function checkTeacherAuth() {
    const savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
    // Try to find the currently active teacher first, otherwise fallback to finding the first teacher/BM/admin in profiles
    const activeUserId = localStorage.getItem('activeUserId') || (savedUsers[0] && savedUsers[0].id);
    const teacher = savedUsers.find(u => u.id === activeUserId && (u.role === 'BM' || u.role === 'admin')) || savedUsers.find(u => u.role === 'BM' || u.role === 'admin');
    if (!teacher) {
        window.location.href = 'index.html';
        return;
    }

    // Re-verify role against the server to prevent localStorage spoofing.
    // apiFetch() auto-attaches the session token minted when this teacher logged
    // in via the main app, so privileged calls (getStudents, manageBms) stay
    // authorized under REQUIRE_AUTH=true. We use GET /login (refresh) which
    // derives the role from that token — no plaintext password needed here.
    try {
        const res = await apiFetch(`${API_BASE}/login`, { method: 'GET' });
        if (!res.ok) throw new Error('No valid session');
        const data = await res.json();

        if (data.role !== 'BM' && data.role !== 'admin') {
            // Token is valid but this user isn't privileged: hard-stop spoofing.
            window.location.href = 'index.html';
            return;
        }
        isBM = data.role === 'BM';
    } catch (e) {
        // No/invalid token, or server unreachable: degrade to the cached role so
        // the legacy (REQUIRE_AUTH=false) dashboard keeps working unchanged.
        // Under enforcement a missing token is simply rejected by the privileged
        // data calls further down.
        console.warn('Could not verify role with server, using cached data:', e);
        isBM = teacher.role === 'BM';
    }

    document.getElementById('teacherNameDisplay').innerText = teacher.name;
    if (typeof initAdminUI === 'function') initAdminUI();
    await refreshDashboardData();
}

async function loadAllStudents({ preserveDisplay = false, throwOnError = false } = {}) {
    const tbody = document.getElementById('studentsTableBody');
    if (!preserveDisplay) tbody.innerHTML = `<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>`;

    try {
        const params = new URLSearchParams({view:'dashboard'});
        if (isAdmin || isBM) params.set('includeSecure','true');
        if (dashboardDataRevision) params.set('since',dashboardDataRevision);
        const url = `${API_BASE}/getStudents?${params}`;
        const res = await apiFetch(url, {cache:'no-store'});
        if (res.status === 304) {allStudents.forEach(s=>{s._summary=true;}); return true;}
        if (!res.ok) throw new Error('Failed to fetch students');
        const data = await res.json();
        // Filter out teachers and admins from list
        if (Array.isArray(data)) {allStudents = data.filter(s => s.role !== 'BM' && s.role !== 'admin'); dashboardDataRevision = '';}
        else {
            // Summary hashes intentionally exclude exercise/SR history. Revalidate any
            // previously opened profile even when only another student's row changed.
            allStudents.forEach(s=>{s._summary=true;});
            const next = new Map((data.full ? [] : allStudents).map(s => [s.id,s]));
            for (const id of data.removed || []) next.delete(id);
            for (const student of data.students) next.set(student.id,student);
            allStudents = [...next.values()]; dashboardDataRevision = data.revision;
        }
        populateTeacherFilter();
        populateClassTimeFilter();
        applyFilters();
        return true;
    } catch (e) {
        if (throwOnError) throw e;
        if (!preserveDisplay) tbody.textContent = `Error loading students: ${e.message}`;
        return false;
    }
}

function refreshDashboardData() {
    if (dashboardRefreshPromise) return dashboardRefreshPromise;
    const button=document.getElementById('refreshDashboardBtn'),status=document.getElementById('dashboardRefreshStatus');
    const label=button.innerHTML;
    button.disabled=true;button.textContent='Refreshing…';status.textContent='Loading fresh data…';
    dashboardRefreshPromise=(async()=>{
        try {
            const results = await Promise.allSettled([loadAllStudents({preserveDisplay:true,throwOnError:true}),
                typeof loadClassCalendar === 'function' ? loadClassCalendar() : Promise.resolve(true)]);
            if (results[0].status === 'rejected') throw results[0].reason;
            if (results[1].status === 'rejected' || results[1].value === false) throw new Error('Calendar could not refresh; the student list is up to date');
            status.textContent=`Updated ${new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Shanghai'})} (Beijing time)`;
            return true;
        } catch(err) {
            status.textContent=`Refresh failed: ${err.message}. Please retry.`;
            return false;
        } finally {
            button.disabled=false;button.innerHTML=label;dashboardRefreshPromise=null;
        }
    })();
    return dashboardRefreshPromise;
}

// ----- FILTERS & TABLE -----

function populateClassTimeFilter() {
    const select = document.getElementById('filterClassTime');
    const currentVal = select.value;
    const teacherFilter = document.getElementById('filterTeacher');
    const selectedTeacher = teacherFilter ? teacherFilter.value : '';
    const times = [...new Set(allStudents.flatMap(s => ClassCalendarCore.memberships(s))
        .filter(g => !selectedTeacher || g.teacher === selectedTeacher).map(g => g.classTime).filter(Boolean))].sort();
    select.innerHTML = '<option value="">All Classes</option>';
    times.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
    // If current value is no longer available, reset
    if (currentVal && !times.includes(currentVal)) {
        select.value = '';
    }
}

function populateTeacherFilter() {
    const select = document.getElementById('filterTeacher');
    if (!select) return;
    const currentVal = select.value;
    const teachers = [...new Set(allStudents.flatMap(s => ClassCalendarCore.memberships(s).map(g => g.teacher)).filter(Boolean))].sort();
    select.innerHTML = '<option value="">All Teachers</option>';
    teachers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
}

function applyFilters() {
    const teacherVal = document.getElementById('filterTeacher') ? document.getElementById('filterTeacher').value : '';
    const classTime = document.getElementById('filterClassTime').value;
    const nameSearch = document.getElementById('filterName').value.trim().toLowerCase();
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    filteredStudents = allStudents.filter(s => {
        if (!ClassCalendarCore.belongsTo(s, teacherVal, classTime)) return false;
        if (nameSearch && !(s.fullName || '').toLowerCase().includes(nameSearch)) return false;
        return true;
    });

    // Sort
    sortFilteredStudents();

    // Render
    renderStudentsTable(dateFrom, dateTo);
    if (typeof renderClassCalendar === 'function') renderClassCalendar();
}

function sortFilteredStudents() {
    const { column, direction } = sortState;
    const dir = direction === 'asc' ? 1 : -1;

    filteredStudents.sort((a, b) => {
        let va, vb;
        if (column === 'name') {
            va = (a.fullName || '').toLowerCase();
            vb = (b.fullName || '').toLowerCase();
            return va < vb ? -dir : va > vb ? dir : 0;
        }
        if (column === 'classTime') {
            va = a.classTime || '';
            vb = b.classTime || '';
            return va < vb ? -dir : va > vb ? dir : 0;
        }
        if (column === 'target') {
            const infoA = getStudentTargetInfo(a);
            const infoB = getStudentTargetInfo(b);
            va = infoA ? infoA.completed / infoA.target.targetSessions : -1;
            vb = infoB ? infoB.completed / infoB.target.targetSessions : -1;
            return (va - vb) * dir;
        }
        if (column === 'avgStudy') {
            const dateFrom = document.getElementById('filterDateFrom').value;
            const dateTo = document.getElementById('filterDateTo').value;
            va = avgStudyDuration(a, dateFrom, dateTo);
            vb = avgStudyDuration(b, dateFrom, dateTo);
            return (va - vb) * dir;
        }
        return 0;
    });
}

function sortTable(col) {
    if (sortState.column === col) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = col;
        sortState.direction = 'asc';
    }
    applyFilters();
}

function clearFilters() {
    if (document.getElementById('filterTeacher')) document.getElementById('filterTeacher').value = '';
    document.getElementById('filterClassTime').value = '';
    document.getElementById('filterName').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    populateClassTimeFilter();
    applyFilters();
}

function onTeacherFilterChange() {
    populateClassTimeFilter();
    applyFilters();
}

// ----- ANALYTICS HELPERS -----

function getAnalyticsInRange(student, dateFrom, dateTo) {
    // Prefer the merged live+archive set (populated by loadStudentArchives);
    // fall back to the live-only analytics array.
    const all = (student && Array.isArray(student._fullAnalytics))
        ? student._fullAnalytics
        : (student && student.analytics) || [];
    if (!Array.isArray(all)) return [];
    return all.filter(e => {
        if (!e.timestamp) return false;
        const ts = e.timestamp.substring(0, 10); // YYYY-MM-DD
        if (dateFrom && ts < dateFrom) return false;
        if (dateTo && ts > dateTo) return false;
        return true;
    });
}

function countSessions(student, dateFrom, dateTo) {
    if (student._summary && student.sessionDays) return student.sessionDays.filter(d=>(!dateFrom || d[0]>=dateFrom)&&(!dateTo || d[0]<=dateTo)).reduce((sum,d)=>sum+d[1],0);
    const analytics = getAnalyticsInRange(student, dateFrom, dateTo);
    return analytics.filter(e => e.type === 'session').length;
}

function avgStudyDuration(student, dateFrom, dateTo) {
    if (student._summary && student.sessionDays) {
        const days=student.sessionDays.filter(d=>(!dateFrom || d[0]>=dateFrom)&&(!dateTo || d[0]<=dateTo));
        const count=days.reduce((sum,d)=>sum+d[2],0);
        return count ? days.reduce((sum,d)=>sum+d[3],0)/count : 0;
    }
    const analytics = getAnalyticsInRange(student, dateFrom, dateTo);
    const studySessions = analytics.filter(e => e.type === 'session' && e.sessionType === 'study');
    if (studySessions.length === 0) return 0;
    const total = studySessions.reduce((sum, s) => sum + (s.data?.durationMs || 0), 0);
    return total / studySessions.length;
}

function formatDuration(ms) {
    if (!ms || ms <= 0) return '—';
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs}s`;
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
}

function exerciseTypeLabel(type) {
    const map = {
        'wordScramble': 'Word Scramble',
        'spelling': 'Spelling',
        'handwriting': 'Handwriting',
        'handwritingAssisted': 'Handwriting (with help)',
        'sentenceScramble': 'Sentence Scramble',
        'sentenceMatch': 'Sentence Match',
        'missingWord': 'Missing Words',
        'findAndFix': 'Find and Fix',
        'speech_practice': 'Speech practice (not graded)',
        'speech_attempt': 'Speech recognition check',
        'speech_gated': 'Speech recording check',
        'speech_error': 'Speech technical issue'
    };
    if (map[type]) return map[type];
    // Speech telemetry types: speech_attempt, speech_error, etc.
    if (type && type.startsWith('speech_')) return 'Speech (' + type.slice(7) + ')';
    return type || '—';
}

/** Accept both original object payloads and JSON-encoded archive payloads. */
function parseExerciseDetails(details) {
    if (details && typeof details === 'object') return details;
    if (typeof details === 'string' && details.trim().startsWith('{')) {
        try { return JSON.parse(details); } catch (_) { /* Legacy plain text. */ }
    }
    return null;
}

function nonSpellingCategory(key) {
    if (/^non-spelling:missing-word:/i.test(key)) return 'missingWord';
    if (/^non-spelling:find-fix:/i.test(key)) return 'findAndFix';
    return null;
}

function formatItemDetails(details) {
    if (!details) return '—';
    const parsed = parseExerciseDetails(details);
    if (parsed) {
        if (parsed.flow === 'optional_practice_v1' && ['transcript_match_only', 'target_aware_hints'].includes(parsed.assessment)) {
            return String(parsed.target || '') + '\n' +
                (parsed.completion === 'practised' ? 'Practice recorded' : 'Continued without assessment') +
                ' · ' + (Number(parsed.recordings) || 0) + ' recording(s) · No pronunciation grade';
        }
        const sentences = parsed.sentences || (parsed.sentence ? [parsed.sentence] : []);
        const answers = parsed.answers || (parsed.answer ? [parsed.answer] : []);
        if (Array.isArray(sentences) && sentences.length && Array.isArray(answers) && answers.length) {
            return sentences.join('\n') + '\nAnswers: ' + answers.join(', ');
        }
        if (parsed.target) return String(parsed.target);
    }
    if (typeof details === 'string') return details;
    // Object (e.g. speech telemetry payload)
    if (details.target) return details.target;
    try { return JSON.stringify(details); } catch (_) { return '—'; }
}

function nonSpellingLocation(details) {
    return [details.book, details.unit != null ? 'U' + details.unit : '', details.page != null ? 'P' + details.page : '', details.id].filter(Boolean).join(' · ');
}

function renderExerciseDetails(details, typed = false) {
    const text = formatItemDetails(details);
    const parsed = typed && parseExerciseDetails(details);
    return `<span class="item-detail-text${typed ? ' non-spelling-detail' : ''}" title="${_esc(text)}">${_esc(text)}</span>`
        + (parsed ? `<small class="exercise-location">${_esc(nonSpellingLocation(parsed))}</small>` : '');
}

// SR stores IDs only. Authored content covers failed-only boards; the latest
// event snapshot (including archives) takes precedence when one exists.
function nonSpellingDetailsIndex(student) {
    const index = new Map();
    if (typeof NonSpellingContent !== 'undefined') {
        for (const [book, units] of Object.entries(TEACHING_CONTENT)) {
            for (const [unit, pages] of Object.entries(units)) {
                for (const [page, content] of Object.entries(pages)) {
                    for (const item of content.nonSpellingExercises || []) {
                        if (item.type !== 'missing-word' && item.type !== 'find-fix') continue;
                        const location = { book, unit, page };
                        index.set(NonSpellingContent.typedKey(item, location), { ...item, ...location });
                    }
                }
            }
        }
    }
    const events = (student._fullAnalytics || student.analytics || []).filter(ex => ex.exerciseType === 'missingWord' || ex.exerciseType === 'findAndFix')
        .slice().sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    for (const ex of events) {
        const details = parseExerciseDetails(ex.itemDetails);
        if (details && nonSpellingCategory(details.key)) index.set(details.key, details);
    }
    return index;
}

function describeSRItem(cat, key, index) {
    const typed = cat === 'sentences' && nonSpellingCategory(key);
    if (!typed) return { category: cat, label: { vocab: 'Vocabulary', sentences: 'Sentences', sentencePairs: 'Sentence Pairs' }[cat], text: key, html: _esc(key) };
    const parts = key.split(':');
    const details = index.get(key) || { book: parts[2].toUpperCase(), unit: parts[3], page: parts[4], id: parts.slice(5).join(':').toUpperCase() };
    const content = details.sentences || details.sentence ? details : nonSpellingLocation(details);
    return { category: typed, label: exerciseTypeLabel(typed), text: formatItemDetails(content), location: nonSpellingLocation(details), html: renderExerciseDetails(content, true) };
}

function sessionTypeLabel(sessionType) {
    const map = {
        'study': 'Study Mode',
        'gomoku': 'Gomoku',
        'uno': 'UNO',
        'vampire': 'Classroom Survivors',
        'vampireSurvivors': 'Classroom Survivors'
    };
    return map[sessionType] || sessionType;
}

function sessionModeBadge(sessionType) {
    if (sessionType === 'study') return `<span class="badge badge-study">Study</span>`;
    return `<span class="badge badge-game">Game</span>`;
}

function getSessionDuration(session) {
    if (session.sessionType === 'study') {
        return session.data?.durationMs || 0;
    }
    // Game sessions: totalTimeSec
    if (session.data?.totalTimeSec) {
        return session.data.totalTimeSec * 1000;
    }
    // Classroom Survivors: survival time only (excludes question/minigame time)
    if (session.sessionType === 'vampireSurvivors' || session.sessionType === 'vampire') {
        return (session.data?.survivalTimeSec || 0) * 1000;
    }
    return 0;
}

function getSessionGameType(session) {
    if (session.sessionType === 'study') return '—';
    return sessionTypeLabel(session.sessionType);
}

function getSessionDifficulty(session) {
    if (session.sessionType === 'gomoku') {
        if (session.data?.mode === 'speed') {
            return `<span class="badge badge-diff-speed">Speed</span>`;
        }
        const diff = session.data?.difficulty;
        if (diff) {
            const capitalized = diff.charAt(0).toUpperCase() + diff.slice(1);
            return `<span class="badge badge-diff-${diff.toLowerCase()}">${capitalized}</span>`;
        }
    }
    return '—';
}

function getSessionResult(session) {
    if (session.sessionType === 'gomoku') {
        const res = session.data?.result;
        if (res === 'win') {
            return `<span class="badge badge-result-win">Win</span>`;
        } else if (res === 'loss') {
            return `<span class="badge badge-result-loss">Loss</span>`;
        } else if (res) {
            const capitalized = res.charAt(0).toUpperCase() + res.slice(1);
            return `<span class="badge">${capitalized}</span>`;
        }
    } else if (session.sessionType === 'uno') {
        const winner = session.data?.winner;
        if (winner === 0) {
            return `<span class="badge badge-result-win">Win</span>`;
        } else if (winner !== undefined) {
            return `<span class="badge badge-result-loss">Loss</span>`;
        }
    } else if (session.sessionType === 'vampireSurvivors' || session.sessionType === 'vampire') {
        if (session.data?.won) {
            return `<span class="badge badge-result-win">Win</span>`;
        } else {
            return `<span class="badge badge-result-loss">Loss</span>`;
        }
    }
    return '—';
}

// ----- TARGET HELPERS (main table) -----

function dashboardGroupsForView(student) {
    const teacher = document.getElementById('filterTeacher').value;
    const time = document.getElementById('filterClassTime').value;
    return ClassCalendarCore.memberships(student).filter(g => (!teacher || g.teacher === teacher) && (!time || g.classTime === time));
}

function getStudentTargetInfo(student, key) {
    const now = new Date();
    if (!key) {
        const groups = dashboardGroupsForView(student);
        const group = groups[0];
        if (group) key = ClassCalendarCore.groupKey(group.teacher, group.classTime);
    }
    const progress = (student._groupProgress || []).find(p => p.key === key);
    if (progress) {
        if (!progress.target) return null;
        const t = progress.target, completed = progress.completed;
        return {target:t,completed,status:now < new Date(t.startTime) ? 'upcoming' : now > new Date(t.endTime) ? completed >= t.targetSessions ? 'completed' : 'missed' : 'active'};
    }
    if (!student.targets || student.targets.length === 0) return null;
    const targets = student.targets.filter(t => !key || ClassCalendarCore.targetBelongsTo(student,t,key));

    // 1. Active target
    for (const t of targets) {
        const start = new Date(t.startTime);
        const end = new Date(t.endTime);
        if (now >= start && now <= end) {
            const completed = student.targetCounts?.[ClassCalendarCore.targetCountKey(t)] ?? (countTargetSessions(student, start, end) + (t.manualOffset || 0));
            return { target: t, completed, status: 'active' };
        }
    }

    // 2. Most recent past target
    const past = targets
        .filter(t => new Date(t.endTime) < now)
        .sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
    if (past.length > 0) {
        const t = past[0];
        const start = new Date(t.startTime);
        const end = new Date(t.endTime);
        const completed = student.targetCounts?.[ClassCalendarCore.targetCountKey(t)] ?? (countTargetSessions(student, start, end) + (t.manualOffset || 0));
        return { target: t, completed, status: completed >= t.targetSessions ? 'completed' : 'missed' };
    }

    // 3. Nearest upcoming target
    const upcoming = targets
        .filter(t => new Date(t.startTime) > now)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (upcoming.length > 0) {
        return { target: upcoming[0], completed: 0, status: 'upcoming' };
    }

    return null;
}

function countTargetSessions(student, start, end) {
    const events = student._fullAnalytics || student.analytics;
    if (!Array.isArray(events)) return 0;
    return events.filter(e => {
        if (e.type !== 'session') return false;
        // Game-mode losses under 2 minutes don't count toward targets
        // (anti-cheat, from 27 Jul 2026 on — not retroactive). Shared helper
        // from frontend_auth.js (loaded before this file in
        // teacher_dashboard.html) so the teacher meter and the student meter
        // always agree.
        if (isUncountedShortLoss(e)) return false;
        const ts = new Date(e.timestamp);
        return ts >= start && ts <= end;
    }).length;
}

function renderTargetBadge(info) {
    if (!info) return '<span style="color:var(--dash-text-dim)">—</span>';
    const { target, completed, status } = info;
    const total = target.targetSessions;
    let badgeClass, statusIcon;
    if (status === 'active')    { badgeClass = 'badge-active';   statusIcon = ''; }
    else if (status === 'completed') { badgeClass = 'badge-complete'; statusIcon = ' ✓'; }
    else if (status === 'missed')    { badgeClass = 'badge-missed';   statusIcon = ' ✗'; }
    else                             { badgeClass = 'badge-upcoming'; statusIcon = ''; }
    return `<span class="badge ${badgeClass}">${completed}/${total}${statusIcon}</span>`;
}
function renderTargetCell(info) { return `<td>${renderTargetBadge(info)}</td>`; }

function renderTargetPeriod(info) {
    if (!info) return '—';
    const fmt = d => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Shanghai', day: 'numeric', month: 'short' });
    return `${fmt(new Date(info.target.startTime))} → ${fmt(new Date(info.target.endTime))}`;
}
function renderPeriodCell(info) { return `<td style="font-size:0.82rem">${renderTargetPeriod(info)}</td>`; }

// ----- RENDER STUDENTS TABLE -----

function renderStudentsTable(dateFrom, dateTo) {
    const tbody = document.getElementById('studentsTableBody');
    const noResults = document.getElementById('noResultsMsg');

    if (filteredStudents.length === 0) {
        tbody.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    tbody.innerHTML = filteredStudents.map(s => {
        const avgMs = avgStudyDuration(s, dateFrom, dateTo);
        const groups = dashboardGroupsForView(s);
        const infos = groups.map(g => getStudentTargetInfo(s, ClassCalendarCore.groupKey(g.teacher,g.classTime)));
        const pwCol = (isAdmin || isBM) ? `<td><span data-visible="false" style="font-size:0.82rem;color:var(--dash-text-dim)">••••••</span><button onclick="event.stopPropagation();toggleRowPw(this,'${(s.password||'').replace(/'/g,"\\'")}')" class="row-action-btn" style="margin-left:6px"><i class="fas fa-eye"></i></button></td>` : '';

        return `<tr class="clickable" onclick="openStudentDetail('${s.id}')">
            <td><div class="student-name-cell"><span class="cell-avatar">${_esc(s.avatar) || '👤'}</span>${_esc(s.fullName || s.login) || 'Unknown'}</div></td>
            <td>${groups.map(g => _esc(g.teacher) || '—').join('<br>')}</td>
            <td>${groups.map(g => _esc(g.classTime) || '—').join('<br>')}</td>
            <td>${infos.map(info => renderTargetBadge(info)).join('<br>')}</td>
            <td style="font-size:0.82rem">${infos.map(info => renderTargetPeriod(info)).join('<br>')}</td>
            <td>${typeof attendanceRateCell === 'function' ? attendanceRateCell(s, dateFrom, dateTo) : '—'}</td>
            <td>${formatDuration(avgMs)}</td>
            ${pwCol}
        </tr>`;
    }).join('');
}

// ----- STUDENT DETAIL -----

async function openStudentDetail(studentId) {
    const sequence = ++studentDetailSequence;
    currentStudent = allStudents.find(s => s.id === studentId);
    if (!currentStudent) return;
    if (currentStudent._summary) {
        const row = document.getElementById('dashboardRefreshStatus');
        row.textContent = 'Loading this student’s details…';
        try {
            const params = new URLSearchParams({studentId});
            if (isAdmin || isBM) params.set('includeSecure','true');
            if (currentStudent.detailRevision) params.set('since',currentStudent.detailRevision);
            const res = await apiFetch(`${API_BASE}/getStudents?${params}`,{cache:'no-store'});
            if (!res.ok && res.status !== 304) throw new Error('Could not load student details. Please retry.');
            const data = res.status === 304 ? [currentStudent] : await res.json();
            if (sequence !== studentDetailSequence) return;
            if (!data[0]) throw new Error('Student no longer exists. Refresh the dashboard.');
            if (res.status !== 304) {delete currentStudent._fullAnalytics; delete currentStudent._archivesLoaded;}
            Object.assign(currentStudent,data[0]); delete currentStudent._summary; delete currentStudent._groupProgress; delete currentStudent.targetCounts; delete currentStudent.sessionDays;
            row.textContent = '';
        } catch(err) {if(sequence === studentDetailSequence) {row.textContent=err.message; currentStudent=null;}return;}
    }

    document.getElementById('dashboardMain').classList.add('hidden');
    document.getElementById('studentDetailView').classList.remove('hidden');

    // Populate header
    document.getElementById('detailStudentAvatar').innerText = currentStudent.avatar || '👤';
    document.getElementById('detailStudentName').innerText = currentStudent.fullName || currentStudent.login;
    document.getElementById('detailStudentClass').innerText = ClassCalendarCore.memberships(currentStudent).map(g => g.classTime).filter(Boolean).join(' · ') || 'No class assigned';
    document.getElementById('detailStudentBook').innerText = currentStudent.book
        ? `${currentStudent.book} U${currentStudent.unit} P${currentStudent.page}`
        : 'No content assigned';

    // Fetch + merge analytics archives so the student's full history shows in
    // the sessions/exercises views (live doc stays small; archives carry the rest).
    await loadStudentArchives(studentId);

    // Reset tabs
    switchTab('sessions');

    // Clear date filters
    document.getElementById('detailDateFrom').value = '';
    document.getElementById('detailDateTo').value = '';

    applyDetailFilters();
}

function backToDashboard() {
    studentDetailSequence++;
    document.getElementById('studentDetailView').classList.add('hidden');
    document.getElementById('dashboardMain').classList.remove('hidden');
    currentStudent = null;

    // Stop test iframe if running
    document.getElementById('testIframe').src = '';
}

// Pure merge: combine a live analytics array with archive docs' `events` arrays.
// De-dups by eventId/timestamp (archives may slightly overlap the live tail).
// Exported for unit testing (no DOM/network dependency).
function mergeAnalytics(live, archives) {
    const liveArr = Array.isArray(live) ? live : [];
    if (!Array.isArray(archives) || archives.length === 0) return liveArr;
    const seen = new Set(liveArr.map(e => e && (e.eventId || e.timestamp)));
    const archived = archives.flatMap(a => (a && Array.isArray(a.events)) ? a.events : []);
    const merged = liveArr.concat(archived.filter(e => e && !seen.has(e.eventId || e.timestamp)));
    return merged;
}

// Fetches a student's analytics-archive docs and merges their events into a
// `_fullAnalytics` array on the current student so sessions/exercises views show
// the complete history (live doc only keeps the most recent events). If the
// fetch fails (e.g. archive endpoint unreachable), we silently fall back to the
// live data — never block the detail view on it.
async function loadStudentArchives(studentId) {
    const student = currentStudent;
    if (!student || student.id !== studentId) return;
    if (student._archivesLoaded) return;
    const badge = document.getElementById('detailArchiveBadge');
    const countEl = document.getElementById('detailArchiveCount');
    const liveEvents = (currentStudent && Array.isArray(currentStudent.analytics)) ? currentStudent.analytics : [];
    student._fullAnalytics = liveEvents; // default: live only
    if (badge) badge.classList.add('hidden');

    try {
        const res = await apiFetch(`${API_BASE}/getStudentArchive?studentId=${encodeURIComponent(studentId)}`);
        if (!res.ok) return;
        const archives = await res.json();
        if (!Array.isArray(archives)) return;
        student._archivesLoaded = true;
        if (archives.length === 0 || currentStudent !== student) return;

        const merged = mergeAnalytics(liveEvents, archives);
        student._fullAnalytics = merged;

        const totalArchived = merged.length - liveEvents.length;
        if (badge && countEl) {
            countEl.textContent = totalArchived;
            badge.classList.remove('hidden');
        }
    } catch (_) {
        // Keep live-only view; archives are a non-critical enhancement.
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

    ['tabSessions','tabExercises','tabTest','tabSettings','tabTargets','tabSR','tabMap','tabAttendance','tabDiagnostics'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const dateFilter = document.getElementById('detailDateFilter');
    const sessionDetail = document.getElementById('sessionDetailPanel');
    sessionDetail.classList.add('hidden');

    if (tab === 'diagnostics') {
        document.getElementById('tabDiagnostics').classList.remove('hidden');
        dateFilter.classList.add('hidden');
        if (typeof renderDiagnosticsTab === 'function') renderDiagnosticsTab();
    } else if (tab === 'attendance') {
        document.getElementById('tabAttendance').classList.remove('hidden');
        dateFilter.classList.remove('hidden');
        renderStudentAttendance();
    } else if (tab === 'sessions') {
        document.getElementById('tabSessions').classList.remove('hidden');
        dateFilter.classList.remove('hidden');
        renderSessions();
    } else if (tab === 'exercises') {
        document.getElementById('tabExercises').classList.remove('hidden');
        dateFilter.classList.remove('hidden');
        renderExercises();
    } else if (tab === 'test') {
        document.getElementById('tabTest').classList.remove('hidden');
        dateFilter.classList.add('hidden');
        startTestMode();
    } else if (tab === 'sr') {
        document.getElementById('tabSR').classList.remove('hidden');
        dateFilter.classList.add('hidden');
        if (typeof renderSRTab === 'function') renderSRTab();
    } else if (tab === 'settings') {
        document.getElementById('tabSettings').classList.remove('hidden');
        if (typeof renderGeoCoverage === 'function') renderGeoCoverage();
        if (typeof renderGeoList === 'function') renderGeoList();
        dateFilter.classList.add('hidden');
        if (typeof populateSettingsTab === 'function') populateSettingsTab();
    } else if (tab === 'targets') {
        document.getElementById('tabTargets').classList.remove('hidden');
        dateFilter.classList.add('hidden');
        if (typeof renderTargetsTab === 'function') renderTargetsTab();
    } else if (tab === 'map') {
        document.getElementById('tabMap').classList.remove('hidden');
        dateFilter.classList.add('hidden');
        if (typeof renderGeoMap === 'function') renderGeoMap();
    }
}

function applyDetailFilters() {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab === 'sessions') renderSessions();
    else if (activeTab === 'exercises') renderExercises();
    else if (activeTab === 'attendance') renderStudentAttendance();
}

function clearDetailDates() {
    document.getElementById('detailDateFrom').value = '';
    document.getElementById('detailDateTo').value = '';
    applyDetailFilters();
}

// ----- SESSIONS TAB -----

function renderSessions() {
    if (!currentStudent) return;
    const dateFrom = document.getElementById('detailDateFrom').value;
    const dateTo = document.getElementById('detailDateTo').value;
    const analytics = getAnalyticsInRange(currentStudent, dateFrom, dateTo);
    const sessions = analytics.filter(e => e.type === 'session');
    sessions.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    const tbody = document.getElementById('sessionsTableBody');
    const noMsg = document.getElementById('noSessionsMsg');
    const sessionDetail = document.getElementById('sessionDetailPanel');
    sessionDetail.classList.add('hidden');

    if (sessions.length === 0) {
        tbody.innerHTML = '';
        noMsg.classList.remove('hidden');
        return;
    }
    noMsg.classList.add('hidden');

    tbody.innerHTML = sessions.map((s, idx) => {
        const uncounted = isUncountedShortLoss(s)
            ? ' <span class="badge badge-not-counted" title="Loss under 2 minutes — not counted toward target">Not counted</span>'
            : '';
        return `<tr class="clickable" onclick="openSessionDetail(${idx})">
            <td>${formatTimestamp(s.timestamp)}</td>
            <td>${sessionModeBadge(s.sessionType)}</td>
            <td>${getSessionGameType(s)}</td>
            <td>${getSessionDifficulty(s)}</td>
            <td>${getSessionResult(s)}${uncounted}</td>
            <td>${formatDuration(getSessionDuration(s))}</td>
        </tr>`;
    }).join('');

    // Store sessions for reference when clicking
    window._renderedSessions = sessions;
}

function openSessionDetail(sessionIdx) {
    const session = window._renderedSessions[sessionIdx];
    if (!session) return;

    const panel = document.getElementById('sessionDetailPanel');
    panel.classList.remove('hidden');

    // Title
    const title = document.getElementById('sessionDetailTitle');
    title.innerText = `${sessionTypeLabel(session.sessionType)} — ${formatTimestamp(session.timestamp)}`;

    // Find exercises belonging to this session
    // Strategy: exercises with timestamps between this session's timestamp and the previous session's timestamp
    const allAnalytics = currentStudent.analytics || [];
    const sessionTimestamp = new Date(session.timestamp).getTime();

    // Get all sessions sorted by time
    const allSessions = allAnalytics.filter(e => e.type === 'session')
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

    // Find this session's index in the sorted list
    const thisSessionSortedIdx = allSessions.findIndex(s => s.timestamp === session.timestamp);

    // Previous session timestamp (or the beginning of time)
    let prevTimestamp = 0;
    if (thisSessionSortedIdx > 0) {
        prevTimestamp = new Date(allSessions[thisSessionSortedIdx - 1].timestamp).getTime();
    }

    // Exercises that occurred between prevTimestamp and sessionTimestamp
    const exercises = allAnalytics.filter(e => {
        if (e.type !== 'exercise') return false;
        const et = new Date(e.timestamp).getTime();
        return et > prevTimestamp && et <= sessionTimestamp;
    });

    const tbody = document.getElementById('sessionExercisesBody');
    if (exercises.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-results"><p>No exercises found for this session.</p></td></tr>`;
        return;
    }

    tbody.innerHTML = exercises.map(ex => {
        const attBadge = ex.exerciseType === 'speech_practice' ? '<span class="badge">Not graded</span>' : ex.attempts > 1
            ? `<span class="badge badge-attempts-high">${ex.attempts}</span>`
            : `<span class="badge badge-attempts-1">${ex.attempts}</span>`;

        return `<tr>
            <td><span class="badge badge-type">${exerciseTypeLabel(ex.exerciseType)}</span></td>
            <td>${renderExerciseDetails(ex.itemDetails, ex.exerciseType === 'missingWord' || ex.exerciseType === 'findAndFix')}</td>
            <td>${attBadge}</td>
        </tr>`;
    }).join('');
}

function closeSessionDetail() {
    document.getElementById('sessionDetailPanel').classList.add('hidden');
}

// ----- EXERCISES TAB -----

function renderExercises() {
    if (!currentStudent) return;
    const dateFrom = document.getElementById('detailDateFrom').value;
    const dateTo = document.getElementById('detailDateTo').value;
    const analytics = getAnalyticsInRange(currentStudent, dateFrom, dateTo);
    let exercises = analytics.filter(e => e.type === 'exercise');

    // Sort
    sortExercises(exercises);

    // Store for filtering
    window._allExercises = exercises;

    applyExerciseFilters();
}

function sortExercises(exercises) {
    const { column, direction } = exerciseSortState;
    const dir = direction === 'asc' ? 1 : -1;

    exercises.sort((a, b) => {
        if (column === 'type') {
            return (a.exerciseType || '').localeCompare(b.exerciseType || '') * dir;
        }
        if (column === 'attempts') {
            return ((a.attempts || 0) - (b.attempts || 0)) * dir;
        }
        if (column === 'timestamp') {
            return (a.timestamp || '').localeCompare(b.timestamp || '') * dir;
        }
        return 0;
    });
}

function sortExerciseTable(col) {
    if (exerciseSortState.column === col) {
        exerciseSortState.direction = exerciseSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        exerciseSortState.column = col;
        exerciseSortState.direction = col === 'timestamp' ? 'desc' : 'asc';
    }
    renderExercises();
}

function applyExerciseFilters() {
    const typeFilter = document.getElementById('filterExerciseType').value;
    const itemFilter = document.getElementById('filterExerciseItem').value.trim().toLowerCase();
    const minAttempts = parseInt(document.getElementById('filterMinAttempts').value) || 0;

    let exercises = window._allExercises || [];

    exercises = exercises.filter(ex => {
        if (typeFilter && ex.exerciseType !== typeFilter) return false;
        if (itemFilter) {
            const details = parseExerciseDetails(ex.itemDetails);
            const searchable = [formatItemDetails(ex.itemDetails), details ? nonSpellingLocation(details) : '', details?.key || ''].join(' ');
            if (!searchable.toLowerCase().includes(itemFilter)) return false;
        }
        if (minAttempts > 0 && (ex.attempts || 0) < minAttempts) return false;
        return true;
    });

    const tbody = document.getElementById('exercisesTableBody');
    const noMsg = document.getElementById('noExercisesMsg');

    if (exercises.length === 0) {
        tbody.innerHTML = '';
        noMsg.classList.remove('hidden');
        return;
    }
    noMsg.classList.add('hidden');

    tbody.innerHTML = exercises.map(ex => {
        const attBadge = ex.exerciseType === 'speech_practice' ? '<span class="badge">Not graded</span>' : ex.attempts > 1
            ? `<span class="badge badge-attempts-high">${ex.attempts}</span>`
            : `<span class="badge badge-attempts-1">${ex.attempts}</span>`;

        const modeBadge = ex.mode === 'study'
            ? `<span class="badge badge-study">Study</span>`
            : `<span class="badge badge-game">Game</span>`;

        // SR lookup: determine SR key and category from this exercise
        const srKey = getSRKeyForExercise(ex);
        const srClickAttr = srKey
            ? `style="cursor:pointer" onclick="${_esc('showSRPopup(' + JSON.stringify(JSON.stringify(srKey)) + ')')}" title="Click to view SR state"`
            : '';

        return `<tr ${srClickAttr}>
            <td><span class="badge badge-type">${exerciseTypeLabel(ex.exerciseType)}</span></td>
            <td>${renderExerciseDetails(ex.itemDetails, ex.exerciseType === 'missingWord' || ex.exerciseType === 'findAndFix')}${srKey ? ' <i class="fas fa-brain" style="color:var(--dash-primary);font-size:0.7rem;opacity:0.7"></i>' : ''}</td>
            <td>${attBadge}</td>
            <td>${modeBadge}</td>
            <td style="color: var(--dash-text-dim); font-size: 0.78rem;">${formatTimestamp(ex.timestamp)}</td>
        </tr>`;
    }).join('');
}

// ----- TEST MODE -----

function startTestMode() {
    if (!currentStudent) return;
    document.getElementById('testStudentNameBanner').innerText = currentStudent.fullName || currentStudent.login;

    // Build the iframe URL with a test-mode query param and student data
    const params = new URLSearchParams({
        testMode: 'true',
        studentId: currentStudent.id,
        studentName: currentStudent.fullName || '',
        studentAvatar: currentStudent.avatar || '👤',
        studentBook: currentStudent.book || '',
        studentUnit: currentStudent.unit || '',
        studentPage: currentStudent.page || '',
        studentClassTime: currentStudent.classTime || ''
    });

    document.getElementById('testIframe').src = `index.html?${params.toString()}`;
}

// ----- LOGOUT -----

function logoutTeacher() {
    localStorage.removeItem('activeUserId');
    // Go back to profile selection on main app
    window.location.href = 'index.html';
}

// Export pure helpers for unit testing (no-op in the browser).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mergeAnalytics, getAnalyticsInRange };
}
