// ============================================================
// ADMIN DASHBOARD - Additional functionality for admin role
// Loaded AFTER teacher_dashboard.js
// ============================================================

let isAdmin = false;
let settingsClassGroups = [];

function initAdminUI() {
    const savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
    const activeUserId = localStorage.getItem('activeUserId') || (savedUsers[0] && savedUsers[0].id);
    const user = savedUsers.find(u => u.id === activeUserId && (u.role === 'admin' || u.role === 'BM')) || savedUsers.find(u => u.role === 'admin' || u.role === 'BM');
    isAdmin = user && user.role === 'admin';
    const isBM = user && user.role === 'BM';

    if (isAdmin) {
        document.getElementById('dashboardTitle').textContent = 'Admin Dashboard';
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.admin-col').forEach(el => el.style.display = '');
        document.querySelectorAll('.bm-or-admin-col').forEach(el => el.classList.remove('hidden'));
    } else if (isBM) {
        document.getElementById('dashboardTitle').textContent = 'BM Dashboard';
        document.querySelectorAll('.admin-col').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.bm-or-admin-col').forEach(el => el.classList.remove('hidden'));
    } else {
        document.querySelectorAll('.admin-col').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.bm-or-admin-col').forEach(el => el.classList.add('hidden'));
    }

    // Both admin and BM can add students and modify student detail settings/targets
    if (isAdmin || isBM) {
        document.querySelectorAll('.bm-or-admin-only').forEach(el => el.classList.remove('hidden'));
    }
}

// --- Password toggle ---
function togglePwVis(inputId, iconId) {
    const inp = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (inp.type === 'password') { inp.type = 'text'; icon.className = 'fas fa-eye-slash'; }
    else { inp.type = 'password'; icon.className = 'fas fa-eye'; }
}

function copyLogin() {
    const inp = document.getElementById('settingsLogin');
    if (!inp || !inp.value) return;
    navigator.clipboard?.writeText(inp.value).then(
        () => showStatus('settingsSaveStatus', '✓ Login copied!', false),
        () => showStatus('settingsSaveStatus', 'Copy failed — select & copy manually.', true)
    );
}

function toggleRowPw(btn, pw) {
    const span = btn.previousElementSibling;
    if (span.dataset.visible === 'true') {
        span.textContent = '••••••';
        span.dataset.visible = 'false';
        btn.innerHTML = '<i class="fas fa-eye"></i>';
    } else {
        span.textContent = pw;
        span.dataset.visible = 'true';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    }
}

// --- Book/Unit/Page cascade helpers ---
function populateBookSelect(selId, currentVal) {
    const sel = document.getElementById(selId);
    sel.innerHTML = '<option value="">—</option>';
    Object.keys(AVAILABLE_CONTENT).sort().forEach(b => {
        sel.innerHTML += `<option value="${b}" ${b===currentVal?'selected':''}>${b}</option>`;
    });
}

function populateUnitSelect(selId, book, currentVal) {
    const sel = document.getElementById(selId);
    sel.innerHTML = '<option value="">—</option>';
    if (!book || !AVAILABLE_CONTENT[book]) return;
    Object.keys(AVAILABLE_CONTENT[book]).sort((a,b)=>a-b).forEach(u => {
        sel.innerHTML += `<option value="${u}" ${u===currentVal?'selected':''}>${u}</option>`;
    });
}

function populatePageSelect(selId, book, unit, currentVal) {
    const sel = document.getElementById(selId);
    sel.innerHTML = '<option value="">—</option>';
    if (!book || !unit || !AVAILABLE_CONTENT[book] || !AVAILABLE_CONTENT[book][unit]) return;
    AVAILABLE_CONTENT[book][unit].forEach(p => {
        const ps = String(p);
        sel.innerHTML += `<option value="${ps}" ${ps===String(currentVal)?'selected':''}>${ps}</option>`;
    });
    // Preserve retired review-page assignments when editing unrelated settings.
    const existingReview = (book === 'Think0' && String(unit) === '4' && String(currentVal) === '45')
        || (book === 'PU3' && String(unit) === '3' && String(currentVal) === '40');
    if (selId === 'settingsPage' && existingReview) {
        const legacy = new Option(currentVal + ' (existing assignment)', String(currentVal), true, true);
        legacy.disabled = true;
        sel.add(legacy);
    }
}

function populateClassTimeSelect(selId, currentVal, includeCustom) {
    const sel = document.getElementById(selId);
    sel.innerHTML = '<option value="">— None —</option>';
    const times = [...new Set(allStudents.flatMap(s => ClassCalendarCore.memberships(s).map(g => g.classTime)).filter(Boolean))].sort();
    if (currentVal && !times.includes(currentVal)) times.push(currentVal);
    times.forEach(t => {
        sel.innerHTML += `<option value="${t}" ${t===currentVal?'selected':''}>${t}</option>`;
    });
    if (includeCustom) sel.innerHTML += '<option value="__custom__">+ New class time...</option>';
}

// --- Cascade handlers for Settings tab ---
function onSettingsBookChange() {
    const book = document.getElementById('settingsBook').value;
    populateUnitSelect('settingsUnit', book, '');
    populatePageSelect('settingsPage', book, '', '');
}
function onSettingsUnitChange() {
    const book = document.getElementById('settingsBook').value;
    const unit = document.getElementById('settingsUnit').value;
    populatePageSelect('settingsPage', book, unit, '');
}

// --- Cascade for Add Student modal ---
function onAddBookChange() {
    const book = document.getElementById('addBook').value;
    populateUnitSelect('addUnit', book, '');
    populatePageSelect('addPage', book, '', '');
}
function onAddUnitChange() {
    const book = document.getElementById('addBook').value;
    const unit = document.getElementById('addUnit').value;
    populatePageSelect('addPage', book, unit, '');
}

// --- Cascade for Bulk Content modal ---
function onBulkBookChange() {
    const book = document.getElementById('bulkBook').value;
    populateUnitSelect('bulkUnit', book, '');
    populatePageSelect('bulkPage', book, '', '');
}
function onBulkUnitChange() {
    const book = document.getElementById('bulkBook').value;
    const unit = document.getElementById('bulkUnit').value;
    populatePageSelect('bulkPage', book, unit, '');
}

// --- Modal helpers ---
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showStatus(elId, msg, isError) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.className = 'save-status ' + (isError ? 'error' : 'success');
    setTimeout(() => { el.textContent = ''; }, 3000);
}

// --- Settings Tab ---
function populateSettingsTab() {
    if (!currentStudent) return;
    document.getElementById('settingsFullName').value = currentStudent.fullName || '';
    document.getElementById('settingsLogin').value = currentStudent.login || '';
    populateTeacherSelect('settingsTeacher', currentStudent.teacher || '');
    document.getElementById('settingsTeacherCustom').classList.add('hidden');
    document.getElementById('settingsTeacherCustom').value = '';
    populateClassTimeSelect('settingsClassTime', currentStudent.classTime || '', false);
    settingsClassGroups = ClassCalendarCore.memberships(currentStudent).filter(g => ClassCalendarCore.groupKey(g.teacher,g.classTime) !== ClassCalendarCore.groupKey(currentStudent.teacher,currentStudent.classTime));
    renderSettingsClassGroups();
    populateBookSelect('settingsBook', currentStudent.book || '');
    populateUnitSelect('settingsUnit', currentStudent.book || '', currentStudent.unit || '');
    populatePageSelect('settingsPage', currentStudent.book || '', currentStudent.unit || '', currentStudent.page || '');
    document.getElementById('settingsPassword').value = currentStudent.password || '';
    document.getElementById('settingsPwIcon').className = 'fas fa-eye';
    document.getElementById('settingsNeedsPwChange').checked = !!currentStudent.needsPasswordChange;
}

function renderSettingsClassGroups() {
    const select = document.getElementById('settingsAdditionalGroup');
    select.replaceChildren(new Option('Choose another group', ''));
    const groups = new Map(allStudents.flatMap(s => ClassCalendarCore.memberships(s)).filter(g => ClassCalendarCore.parseClassTime(g.classTime))
        .map(g => [ClassCalendarCore.groupKey(g.teacher,g.classTime),g]));
    for (const [key,g] of [...groups].sort((a,b) => a[0].localeCompare(b[0]))) {
        if (settingsClassGroups.some(s => ClassCalendarCore.groupKey(s.teacher,s.classTime) === key)) continue;
        if (key === ClassCalendarCore.groupKey(currentStudent.teacher,currentStudent.classTime)) continue;
        select.add(new Option(`${g.teacher || 'No teacher'} · ${g.classTime}`,key));
    }
    document.getElementById('settingsClassGroupsList').innerHTML = settingsClassGroups.map((g,i) =>
        `<div class="student-group-chip">${_esc(g.teacher) || 'No teacher'} · ${_esc(g.classTime)} <button type="button" class="row-action-btn" onclick="removeStudentClassGroup(${i})" aria-label="Remove ${_esc(g.classTime)}">×</button></div>`).join('');
}
function addStudentClassGroup() {
    const key = document.getElementById('settingsAdditionalGroup').value;
    if (!key) return;
    const [teacher,classTime] = JSON.parse(key);
    settingsClassGroups.push({teacher,classTime});
    renderSettingsClassGroups();
}
function removeStudentClassGroup(index) { settingsClassGroups.splice(index,1); renderSettingsClassGroups(); }

function onSettingsTeacherChange() {
    const val = document.getElementById('settingsTeacher').value;
    if (val === '__custom__') {
        document.getElementById('settingsTeacherCustom').classList.remove('hidden');
    } else {
        document.getElementById('settingsTeacherCustom').classList.add('hidden');
    }
}

async function saveStudentSettings() {
    if (!currentStudent) return;
    const saveBtn = document.querySelector('button[onclick="saveStudentSettings()"]');
    const originalHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving...';
    }
    let teacher = document.getElementById('settingsTeacher').value;
    if (teacher === '__custom__') teacher = document.getElementById('settingsTeacherCustom').value.trim();
    const fields = {
        fullName: document.getElementById('settingsFullName').value.trim(),
        teacher: teacher,
        classTime: document.getElementById('settingsClassTime').value,
        classGroups: settingsClassGroups.filter(g => ClassCalendarCore.groupKey(g.teacher,g.classTime) !== ClassCalendarCore.groupKey(teacher,document.getElementById('settingsClassTime').value)),
        book: document.getElementById('settingsBook').value,
        unit: document.getElementById('settingsUnit').value,
        page: document.getElementById('settingsPage').value,
        needsPasswordChange: document.getElementById('settingsNeedsPwChange').checked
    };
    // Only send password when the teacher typed one. An empty box means
    // "leave unchanged" — otherwise the stored password would be wiped.
    const newPw = document.getElementById('settingsPassword').value.trim();
    if (newPw) fields.password = newPw;
    try {
        const res = await apiFetch(`${API_BASE}/updateStudent`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ studentId: currentStudent.id, fields })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        // Update local data
        Object.assign(currentStudent, fields);
        Object.assign(currentStudent, data.student);
        document.getElementById('detailStudentName').textContent = fields.fullName;
        document.getElementById('detailStudentClass').textContent = ClassCalendarCore.memberships(currentStudent).map(g => g.classTime).filter(Boolean).join(' · ') || 'No class';
        document.getElementById('detailStudentBook').textContent = fields.book ? `${fields.book} U${fields.unit} P${fields.page}` : 'No content';
        showStatus('settingsSaveStatus', '✓ Saved!', false);
        populateTeacherFilter(); populateClassTimeFilter(); applyFilters();
        if (typeof loadClassCalendar === 'function') await loadClassCalendar();
    } catch(e) {
        showStatus('settingsSaveStatus', 'Error: ' + e.message, true);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHtml;
        }
    }
}

// --- Targets Tab ---
function renderTargetsTab() {
    if (!currentStudent) return;
    const groups = ClassCalendarCore.memberships(currentStudent);
    const groupSelect = document.getElementById('targetGroup');
    const selectedGroup = groupSelect.value;
    groupSelect.replaceChildren();
    groups.forEach(g => groupSelect.add(new Option(`${g.teacher || 'No teacher'} · ${g.classTime || 'No class'}`,ClassCalendarCore.groupKey(g.teacher,g.classTime))));
    if (groups.some(g => ClassCalendarCore.groupKey(g.teacher,g.classTime) === selectedGroup)) groupSelect.value = selectedGroup;
    const targets = currentStudent.targets || [];
    const tbody = document.getElementById('targetsTableBody');
    const noMsg = document.getElementById('noTargetsMsg');
    if (targets.length === 0) { tbody.innerHTML = ''; noMsg.classList.remove('hidden'); return; }
    noMsg.classList.add('hidden');

    tbody.innerHTML = targets.map((t, i) => {
        const start = new Date(t.startTime);
        const end = new Date(t.endTime);
        const now = new Date();
        const recorded = countSessionsInRange(currentStudent, start, end);
        const offset = t.manualOffset || 0;
        const completed = recorded + offset;
        const pct = Math.min(100, Math.round(completed / t.targetSessions * 100));
        let status, statusClass;
        if (now < start) { status = 'Upcoming'; statusClass = 'badge-upcoming'; }
        else if (now > end) { status = completed >= t.targetSessions ? 'Completed ✓' : 'Missed'; statusClass = completed >= t.targetSessions ? 'badge-complete' : 'badge-missed'; }
        else { status = 'Active'; statusClass = 'badge-active'; }

        const startStr = formatBeijingDT(start);
        const endStr = formatBeijingDT(end);
        const offsetNote = offset > 0 ? ` <span style="color:#f59e0b;font-size:0.75rem" title="Includes ${offset} manually added session(s)">(+${offset} manual)</span>` : '';
        return `<tr>
            <td>${targetGroupSelect(t,i,groups)}</td>
            <td style="font-size:0.8rem">${startStr}<br>→ ${endStr}</td>
            <td>${t.targetSessions}</td>
            <td><strong>${completed}</strong> / ${t.targetSessions} (${pct}%)${offsetNote}</td>
            <td><span class="badge ${statusClass}">${status}</span></td>
            <td style="white-space:nowrap">
                <button onclick="adjustTargetOffset(${i})" class="row-action-btn" title="Manually adjust completed count"><i class="fas fa-pen"></i></button>
                <button onclick="deleteTarget(${i}, this)" class="row-action-btn" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function targetGroupSelect(target, index, groups) {
    const key = ClassCalendarCore.targetGroupKey(currentStudent,target);
    const options = new Map(groups.map(g => [ClassCalendarCore.groupKey(g.teacher,g.classTime), `${g.teacher || 'No teacher'} · ${g.classTime || 'No class'}`]));
    if (key && !options.has(key)) {
        try { const g = JSON.parse(key); options.set(key, `${g[0] || 'No teacher'} · ${g[1] || 'No class'} (former group)`); } catch (_) {}
    }
    return `<select class="form-input target-group-select" onchange="assignTargetGroup(${index},this.value)"><option value="">Choose group</option>${[...options].map(([value,label]) => `<option value="${_esc(value)}" ${value===key?'selected':''}>${_esc(label)}</option>`).join('')}</select>`;
}
async function assignTargetGroup(index,key) {
    if (!currentStudent || !key) { renderTargetsTab(); return; }
    const before = JSON.parse(JSON.stringify(currentStudent.targets));
    const targets = before.map((t,i) => i===index ? {...t,groupKey:key} : t);
    try {
        const res = await apiFetch(`${API_BASE}/updateStudent`, {method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({studentId:currentStudent.id,fields:{targets},expectedTargets:before})});
        if (!res.ok) throw new Error(await res.text());
        currentStudent.targets = targets;
        renderTargetsTab(); applyFilters();
        showStatus('targetSaveStatus','✓ Target group saved!',false);
    } catch (e) { renderTargetsTab(); showStatus('targetSaveStatus','Error: '+e.message,true); }
}

function countSessionsInRange(student, start, end) {
    const events = student._fullAnalytics || student.analytics;
    if (!Array.isArray(events)) return 0;
    return events.filter(e => {
        if (e.type !== 'session') return false;
        // Game-mode losses under 2 minutes don't count toward targets
        // (anti-cheat, from 27 Jul 2026 on — not retroactive). Shared helper
        // from frontend_auth.js.
        if (isUncountedShortLoss(e)) return false;
        const ts = new Date(e.timestamp);
        return ts >= start && ts <= end;
    }).length;
}

function formatBeijingDT(d) {
    return d.toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

async function addTargetForStudent() {
    if (!currentStudent) return;
    const startVal = document.getElementById('targetStart').value;
    const endVal = document.getElementById('targetEnd').value;
    const count = parseInt(document.getElementById('targetCount').value);
    const groupKey = document.getElementById('targetGroup').value;
    if (!startVal || !endVal || !count) { showStatus('targetSaveStatus', 'Fill all fields', true); return; }

    const addBtn = document.querySelector('button[onclick="addTargetForStudent()"]');
    const originalHtml = addBtn ? addBtn.innerHTML : '';
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Adding...';
    }

    // datetime-local gives local time; append Beijing offset
    const startTime = startVal + ':00+08:00';
    const endTime = endVal + ':00+08:00';

    try {
        const res = await apiFetch(`${API_BASE}/setTargets`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ studentIds: [currentStudent.id], target: { startTime, endTime, targetSessions: count, groupKey } })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const result = data.results[0];
        if (!result.success) throw new Error(result.error || 'Could not save target.');
        currentStudent.targets = result.targets;
        renderTargetsTab();
        applyFilters();
        showStatus('targetSaveStatus', '✓ Target added!', false);
    } catch(e) {
        showStatus('targetSaveStatus', 'Error: ' + e.message, true);
    } finally {
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.innerHTML = originalHtml;
        }
    }
}

async function deleteTarget(idx, clickedBtn) {
    if (!currentStudent || !confirm('Delete this target?')) return;

    const originalHtml = clickedBtn ? clickedBtn.innerHTML : '';
    if (clickedBtn) {
        clickedBtn.disabled = true;
        clickedBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    }

    const expectedTargets = JSON.parse(JSON.stringify(currentStudent.targets));
    const removedTarget = currentStudent.targets[idx];
    currentStudent.targets.splice(idx, 1);
    try {
        const res = await apiFetch(`${API_BASE}/updateStudent`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ studentId: currentStudent.id, fields: { targets: currentStudent.targets }, expectedTargets })
        });
        if (!res.ok) throw new Error(await res.text());
        renderTargetsTab();
    } catch(e) { 
        console.warn('Failed to delete target', e);
        currentStudent.targets.splice(idx, 0, removedTarget);
        if (clickedBtn) {
            clickedBtn.disabled = false;
            clickedBtn.innerHTML = originalHtml;
        }
        alert('Failed to delete target: ' + e.message);
    }
}

async function adjustTargetOffset(idx) {
    if (!currentStudent || !currentStudent.targets || !currentStudent.targets[idx]) return;
    const target = currentStudent.targets[idx];
    const recorded = countSessionsInRange(currentStudent, new Date(target.startTime), new Date(target.endTime));
    const currentOffset = target.manualOffset || 0;
    const currentTotal = recorded + currentOffset;

    const input = prompt(
        `Target: ${target.targetSessions} sessions\n` +
        `Recorded from DB: ${recorded}\n` +
        `Current manual offset: +${currentOffset}\n` +
        `Displayed total: ${currentTotal}/${target.targetSessions}\n\n` +
        `Enter the TOTAL completed sessions (recorded + manual):`,
        String(currentTotal)
    );
    if (input === null) return; // cancelled

    const newTotal = parseInt(input, 10);
    if (isNaN(newTotal) || newTotal < 0) { alert('Please enter a valid number.'); return; }
    if (newTotal < recorded) {
        alert(`Cannot set total below the ${recorded} recorded sessions. To remove recorded sessions, delete them from the Sessions tab.`);
        return;
    }

    const expectedTargets = JSON.parse(JSON.stringify(currentStudent.targets));
    const newOffset = newTotal - recorded;
    target.manualOffset = newOffset;

    try {
        const res = await apiFetch(`${API_BASE}/updateStudent`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ studentId: currentStudent.id, fields: { targets: currentStudent.targets }, expectedTargets })
        });
        if (!res.ok) throw new Error(await res.text());
        renderTargetsTab();
    } catch(e) {
        target.manualOffset = currentOffset; // revert on failure
        alert('Failed to save: ' + e.message);
    }
}

// --- Add Student Modal ---
function openAddStudentModal() {
    document.getElementById('addStudentModal').classList.remove('hidden');
    document.getElementById('addStudentError').classList.add('hidden');
    ['addId','addLogin','addPassword','addFullName'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('addNeedsPwChange').checked = true;
    populateTeacherSelect('addTeacher', '');
    document.getElementById('addTeacherCustom').classList.add('hidden');
    document.getElementById('addTeacherCustom').value = '';
    populateClassTimeSelect('addClassTime', '', true);
    document.getElementById('addClassTimeCustom').classList.add('hidden');
    document.getElementById('addClassTimeCustom').value = '';
    populateBookSelect('addBook', '');
    populateUnitSelect('addUnit', '', '');
    populatePageSelect('addPage', '', '', '');
}

function populateTeacherSelect(selId, currentVal) {
    const sel = document.getElementById(selId);
    const teachers = [...new Set(allStudents.flatMap(s => ClassCalendarCore.memberships(s).map(g => g.teacher)).filter(Boolean))].sort();
    // Ensure 'Val' is always present
    if (!teachers.includes('Val')) teachers.unshift('Val');
    sel.innerHTML = '<option value="">— Select Teacher —</option>';
    teachers.forEach(t => {
        sel.innerHTML += `<option value="${t}" ${t===currentVal?'selected':''}>${t}</option>`;
    });
    sel.innerHTML += '<option value="__custom__">+ New teacher...</option>';
}

function onAddTeacherChange() {
    const val = document.getElementById('addTeacher').value;
    if (val === '__custom__') {
        document.getElementById('addTeacherCustom').classList.remove('hidden');
    } else {
        document.getElementById('addTeacherCustom').classList.add('hidden');
    }
}

async function submitAddStudent() {
    const errEl = document.getElementById('addStudentError');
    errEl.classList.add('hidden');
    const id = document.getElementById('addId').value.trim();
    const login = document.getElementById('addLogin').value.trim();
    const password = document.getElementById('addPassword').value.trim();
    const fullName = document.getElementById('addFullName').value.trim();

    let teacher = document.getElementById('addTeacher').value;
    if (teacher === '__custom__') teacher = document.getElementById('addTeacherCustom').value.trim();
    if (!id || !login || !password || !fullName || !teacher) { errEl.textContent = 'Fill required fields (*)'; errEl.classList.remove('hidden'); return; }

    let classTime = document.getElementById('addClassTime').value;
    if (classTime === '__custom__') classTime = document.getElementById('addClassTimeCustom').value.trim();

    const body = {
        id, login, password, fullName, classTime, teacher,
        book: document.getElementById('addBook').value,
        unit: document.getElementById('addUnit').value,
        page: document.getElementById('addPage').value,
        needsPasswordChange: document.getElementById('addNeedsPwChange').checked
    };

    const addBtn = document.querySelector('button[onclick="submitAddStudent()"]');
    const originalHtml = addBtn ? addBtn.innerHTML : '';
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating...';
    }

    try {
        const res = await apiFetch(`${API_BASE}/addStudent`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(body)
        });
        if (!res.ok) { 
            errEl.textContent = await res.text(); 
            errEl.classList.remove('hidden'); 
            if (addBtn) {
                addBtn.disabled = false;
                addBtn.innerHTML = originalHtml;
            }
            return; 
        }
        closeModal('addStudentModal');
        refreshDashboardData(); // New membership also updates future calendar rosters.
    } catch(e) {
        errEl.textContent = 'Network error'; errEl.classList.remove('hidden');
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.innerHTML = originalHtml;
        }
    }
}

// --- Bulk operations ---
function previewBulkStudents(classSelId, previewId) {
    const classTime = document.getElementById(classSelId).value;
    const preview = document.getElementById(previewId);
    if (!classTime) { preview.innerHTML = ''; return; }
    const currentTeacher = document.getElementById('filterTeacher') ? document.getElementById('filterTeacher').value : '';
    const students = allStudents.filter(s => ClassCalendarCore.belongsTo(s,currentTeacher,classTime) && s.role !== 'BM' && s.role !== 'admin');
    preview.innerHTML = `<div class="bulk-preview-label">Will apply to ${students.length} student(s):</div>` +
        students.map(s => `<span class="bulk-chip">${_esc(s.avatar) || '👤'} ${_esc(s.fullName || s.login)}</span>`).join('');
}

function openBulkTargetsModal() {
    document.getElementById('bulkTargetsModal').classList.remove('hidden');
    document.getElementById('bulkTargetError').classList.add('hidden');
    populateClassTimeSelect('bulkTargetClass', document.getElementById('filterClassTime').value, false);
    document.getElementById('bulkTargetStart').value = '';
    document.getElementById('bulkTargetEnd').value = '';
    document.getElementById('bulkTargetCount').value = '10';
    previewBulkStudents('bulkTargetClass', 'bulkTargetPreview');
}

async function submitBulkTargets() {
    const errEl = document.getElementById('bulkTargetError');
    errEl.classList.add('hidden');
    const classTime = document.getElementById('bulkTargetClass').value;
    const startVal = document.getElementById('bulkTargetStart').value;
    const endVal = document.getElementById('bulkTargetEnd').value;
    const count = parseInt(document.getElementById('bulkTargetCount').value);
    if (!classTime || !startVal || !endVal || !count) { errEl.textContent = 'Fill all fields'; errEl.classList.remove('hidden'); return; }

    const currentTeacher = document.getElementById('filterTeacher') ? document.getElementById('filterTeacher').value : '';
    const ids = allStudents.filter(s => ClassCalendarCore.belongsTo(s,currentTeacher,classTime) && s.role !== 'BM' && s.role !== 'admin').map(s => s.id);
    if (ids.length === 0) { errEl.textContent = 'No students in this class'; errEl.classList.remove('hidden'); return; }

    const submitBtn = document.querySelector('button[onclick="submitBulkTargets()"]');
    if (submitBtn && submitBtn.disabled) return;
    const originalHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Setting...';
    }

    try {
        const res = await apiFetch(`${API_BASE}/setTargets`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ studentIds: ids, target: { startTime: startVal+':00+08:00', endTime: endVal+':00+08:00', targetSessions: count, classTime, teacher: currentTeacher } })
        });
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();
        const failed = (result.results || []).filter(r => !r.success);
        if (failed.length) throw new Error(`${failed.length} student target(s) could not be saved. Please retry.`);
        closeModal('bulkTargetsModal');
        loadAllStudents();
    } catch(e) {
        errEl.textContent = 'Error: ' + e.message; errEl.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    }
}

function openBulkContentModal() {
    document.getElementById('bulkContentModal').classList.remove('hidden');
    document.getElementById('bulkContentError').classList.add('hidden');
    populateClassTimeSelect('bulkContentClass', document.getElementById('filterClassTime').value, false);
    populateBookSelect('bulkBook', '');
    populateUnitSelect('bulkUnit', '', '');
    populatePageSelect('bulkPage', '', '', '');
    previewBulkStudents('bulkContentClass', 'bulkContentPreview');
}

async function submitBulkContent() {
    const errEl = document.getElementById('bulkContentError');
    errEl.classList.add('hidden');
    const classTime = document.getElementById('bulkContentClass').value;
    const book = document.getElementById('bulkBook').value;
    const unit = document.getElementById('bulkUnit').value;
    const page = document.getElementById('bulkPage').value;
    if (!classTime || !book || !unit || !page) { errEl.textContent = 'Fill all fields'; errEl.classList.remove('hidden'); return; }

    const currentTeacher = document.getElementById('filterTeacher') ? document.getElementById('filterTeacher').value : '';
    const students = allStudents.filter(s => ClassCalendarCore.belongsTo(s,currentTeacher,classTime) && s.role !== 'BM' && s.role !== 'admin');
    if (students.length === 0) { errEl.textContent = 'No students in this class'; errEl.classList.remove('hidden'); return; }

    const submitBtn = document.querySelector('button[onclick="submitBulkContent()"]');
    if (submitBtn && submitBtn.disabled) return;
    const originalHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Applying...';
    }

    try {
        for (const s of students) {
            const res = await apiFetch(`${API_BASE}/updateStudent`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ studentId: s.id, fields: { book, unit, page } })
            });
            if (!res.ok) throw new Error(await res.text());
        }
        closeModal('bulkContentModal');
        loadAllStudents();
    } catch(e) {
        errEl.textContent = 'Error: ' + e.message; errEl.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    }
}

// ============================================================
// SR STATE TAB
// ============================================================

/**
 * Renders the SR State tab for the current student.
 */
function renderSRTab() {
    if (!currentStudent) return;
    const srState = currentStudent.srState || {};
    const tbody = document.getElementById('srTableBody');
    const noMsg = document.getElementById('noSRMsg');

    const categoryFilter = document.getElementById('srCategoryFilter').value;
    const searchTerm = (document.getElementById('srItemSearch').value || '').toLowerCase();
    const sortBy = document.getElementById('srSortBy').value;

    // Flatten all SR entries into a single list
    let rows = [];
    const detailsIndex = nonSpellingDetailsIndex(currentStudent);

    for (const cat of ['vocab', 'sentences', 'sentencePairs']) {
        if (!srState[cat]) continue;
        for (const [key, data] of Object.entries(srState[cat])) {
            const item = describeSRItem(cat, key, detailsIndex);
            if (categoryFilter && item.category !== categoryFilter) continue;
            if (searchTerm && ![key, item.text, item.label, item.location || ''].join(' ').toLowerCase().includes(searchTerm)) continue;
            rows.push({ ...data, cat, catLabel: item.label, key, item });
        }
    }

    if (rows.length === 0) {
        tbody.innerHTML = '';
        noMsg.classList.remove('hidden');
        return;
    }
    noMsg.classList.add('hidden');

    // Sort
    rows.sort((a, b) => {
        switch (sortBy) {
            case 'dueAsc':  return (a.dueAfterSession || 0) - (b.dueAfterSession || 0);
            case 'dueDesc': return (b.dueAfterSession || 0) - (a.dueAfterSession || 0);
            case 'intervalAsc': return (a.interval || 0) - (b.interval || 0);
            case 'intervalDesc': return (b.interval || 0) - (a.interval || 0);
            case 'key': return a.item.text.localeCompare(b.item.text);
            default: return 0;
        }
    });

    const currentSession = currentStudent.sessionCount || 0;

    tbody.innerHTML = rows.map(r => {
        const isDue = (r.dueAfterSession || 0) <= currentSession;
        const resultClass = r.lastResult === 'success' ? 'sr-result-success' : ['fail', 'failure'].includes(r.lastResult) ? 'sr-result-fail' : '';
        const dueStr = isDue
            ? `<span class="sr-due-now">Due now (sess ${r.dueAfterSession})</span>`
            : `Session ${r.dueAfterSession}`;
        return `<tr>
            <td><span class="badge badge-type" style="font-size:0.7rem">${r.catLabel}</span></td>
            <td class="sr-key-cell${nonSpellingCategory(r.key) ? ' non-spelling-detail' : ''}" title="${_esc(r.key)}">${r.item.html}</td>
            <td><strong>${r.interval || 1}</strong></td>
            <td>${dueStr}</td>
            <td>${r.lastSession ?? '—'}</td>
            <td><span class="${resultClass}">${r.lastResult || '—'}</span></td>
        </tr>`;
    }).join('');
}

// ============================================================
// SR POPUP (from Exercises tab click)
// ============================================================

/**
 * Given an exercise event, return the SR key string (or null if not applicable).
 */
function getSRKeyForExercise(ex) {
    if (!ex || !ex.exerciseType || !ex.itemDetails) return null;
    if (ex.exerciseType === 'missingWord' || ex.exerciseType === 'findAndFix') {
        const details = parseExerciseDetails(ex.itemDetails);
        return details && nonSpellingCategory(details.key) ? details.key : null;
    }
    // These types map to SR keys
    const srTypes = ['spelling', 'wordScramble', 'sentenceScramble', 'sentenceMatch'];
    if (!srTypes.includes(ex.exerciseType)) return null;
    return ex.itemDetails;
}

/**
 * Shows an inline SR state popup for a given key.
 * @param {string} keyJson - JSON-encoded key string (double-stringified for html attr safety)
 */
function showSRPopup(keyJson) {
    const key = JSON.parse(keyJson);
    if (!currentStudent || !currentStudent.srState) return;

    const srState = currentStudent.srState;
    let found = null;
    let foundCat = null;

    for (const cat of ['vocab', 'sentences', 'sentencePairs']) {
        if (srState[cat] && srState[cat][key]) {
            found = srState[cat][key];
            foundCat = cat;
            break;
        }
    }

    // Remove any existing popup
    document.querySelectorAll('.sr-inline-popup').forEach(el => el.remove());

    const popup = document.createElement('div');
    popup.className = 'sr-inline-popup modal-overlay';
    popup.onclick = (e) => { if (e.target === popup) popup.remove(); };

    const item = describeSRItem(foundCat || 'sentences', key, nonSpellingDetailsIndex(currentStudent));
    const currentSession = currentStudent.sessionCount || 0;

    if (!found) {
        popup.innerHTML = `<div class="modal-box" style="max-width:440px">
            <div class="modal-header"><h2><i class="fas fa-brain"></i> SR State</h2><button onclick="this.closest('.sr-inline-popup').remove()" class="modal-close">&times;</button></div>
            <div class="modal-body">
                <p style="color:var(--dash-text-dim);font-style:italic">No SR data found for this item.</p>
                <p style="color:var(--dash-text-dim);font-size:0.82rem;margin-top:8px">Key: <code>${_esc(key)}</code></p>
            </div>
        </div>`;
    } else {
        const isDue = (found.dueAfterSession || 0) <= currentSession;
        const resultColor = found.lastResult === 'success' ? 'var(--dash-accent)' : 'var(--dash-danger)';
        popup.innerHTML = `<div class="modal-box" style="max-width:480px">
            <div class="modal-header"><h2><i class="fas fa-brain"></i> SR State</h2><button onclick="this.closest('.sr-inline-popup').remove()" class="modal-close">&times;</button></div>
            <div class="modal-body">
                <div class="sr-popup-item">${item.html}</div>
                <div class="sr-popup-category"><span class="badge badge-type">${item.label}</span></div>
                <div class="sr-popup-grid">
                    <div class="sr-popup-stat"><span class="sr-popup-label">Interval</span><span class="sr-popup-val">${found.interval ?? 1} session(s)</span></div>
                    <div class="sr-popup-stat"><span class="sr-popup-label">Due After Session</span><span class="sr-popup-val ${isDue ? 'sr-due-now' : ''}">${found.dueAfterSession ?? '—'}${isDue ? ' ✓ Due now' : ''}</span></div>
                    <div class="sr-popup-stat"><span class="sr-popup-label">Last Seen Session</span><span class="sr-popup-val">${found.lastSession ?? '—'}</span></div>
                    <div class="sr-popup-stat"><span class="sr-popup-label">Last Result</span><span class="sr-popup-val" style="color:${resultColor};font-weight:700">${found.lastResult ?? '—'}</span></div>
                </div>
                <p style="color:var(--dash-text-dim);font-size:0.75rem;margin-top:16px">Student is currently at session <strong>${currentSession}</strong>.</p>
            </div>
        </div>`;
    }

    document.body.appendChild(popup);
}

// ============================================================
// ADMIN - MANAGE BMs PANEL
// ============================================================

function openManageBmsModal() {
    document.getElementById('manageBmsModal').classList.remove('hidden');
    switchBmModalTab('bms');
}

function switchBmModalTab(tab) {
    // Switch active tab buttons
    ['bmTabBms', 'bmTabAdd', 'bmTabLogs'].forEach(id => {
        document.getElementById(id).classList.remove('active');
    });
    document.getElementById(`bmTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');

    // Switch tab contents
    ['bmContentBms', 'bmContentAdd', 'bmContentLogs'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(`bmContent${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove('hidden');

    if (tab === 'bms') {
        loadBmsList();
    } else if (tab === 'logs') {
        loadBmActivityLogs();
    }
}

async function loadBmsList() {
    const tbody = document.getElementById('bmsTableBody');
    tbody.innerHTML = `<tr><td colspan="4"><div class="loading-spinner"></div></td></tr>`;

    try {
        const res = await apiFetch(`${API_BASE}/manageBms?action=list`);
        if (!res.ok) throw new Error(await res.text());
        const bms = await res.json();
        renderBmsList(bms);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="no-results"><p>Error: ${e.message}</p></td></tr>`;
    }
}

function renderBmsList(bms) {
    const tbody = document.getElementById('bmsTableBody');
    if (bms.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="no-results"><p>No BM accounts found.</p></td></tr>`;
        return;
    }

    tbody.innerHTML = bms.map(bm => {
        return `<tr>
            <td><strong>${bm.fullName || '—'}</strong></td>
            <td><code>${bm.login}</code></td>
            <td>
                <div class="pw-field-row" style="max-width: 250px;">
                    <input type="password" value="${bm.password}" id="bmPw_${bm.id}" class="form-input" style="height: 32px; font-size: 0.85rem;" readonly>
                    <button type="button" onclick="togglePwVis('bmPw_${bm.id}', 'bmPwIcon_${bm.id}')" class="pw-toggle-btn" style="height: 32px; width: 32px;"><i id="bmPwIcon_${bm.id}" class="fas fa-eye"></i></button>
                </div>
            </td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button onclick="changeBmPasswordPrompt('${bm.id}', this)" class="dash-action-btn" style="padding: 4px 8px; font-size: 0.8rem;" title="Change Password"><i class="fas fa-key"></i> Pass</button>
                    <button onclick="submitDeleteBm('${bm.id}', this)" class="dash-action-btn" style="padding: 4px 8px; font-size: 0.8rem; background-color: var(--dash-danger);" title="Delete BM"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function submitAddBm() {
    const id = document.getElementById('addBmId').value.trim();
    const login = document.getElementById('addBmLogin').value.trim();
    const fullName = document.getElementById('addBmFullName').value.trim();
    const password = document.getElementById('addBmPassword').value.trim();
    const errEl = document.getElementById('addBmError');

    errEl.classList.add('hidden');
    errEl.textContent = '';

    if (!id || !login || !fullName || !password) {
        errEl.textContent = 'All fields are required.';
        errEl.classList.remove('hidden');
        return;
    }

    const addBtn = document.querySelector('button[onclick="submitAddBm()"]');
    const originalHtml = addBtn ? addBtn.innerHTML : '';
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating...';
    }

    try {
        const res = await apiFetch(`${API_BASE}/manageBms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', id, login, fullName, password })
        });
        if (!res.ok) throw new Error(await res.text());

        // Reset fields
        ['addBmId', 'addBmLogin', 'addBmFullName', 'addBmPassword'].forEach(fId => {
            document.getElementById(fId).value = '';
        });
        
        switchBmModalTab('bms');
    } catch (e) {
        errEl.textContent = 'Error: ' + e.message;
        errEl.classList.remove('hidden');
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.innerHTML = originalHtml;
        }
    }
}

async function changeBmPasswordPrompt(bmId, clickedBtn) {
    const newPw = prompt("Enter new password for this BM:");
    if (newPw === null) return; // user cancelled
    const password = newPw.trim();
    if (!password) {
        alert("Password cannot be empty.");
        return;
    }

    const originalHtml = clickedBtn ? clickedBtn.innerHTML : '';
    if (clickedBtn) {
        clickedBtn.disabled = true;
        clickedBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    }

    try {
        const res = await apiFetch(`${API_BASE}/manageBms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'changePassword', bmId, password })
        });
        if (!res.ok) throw new Error(await res.text());
        alert("Password updated successfully!");
        loadBmsList();
    } catch (e) {
        alert("Error changing password: " + e.message);
        if (clickedBtn) {
            clickedBtn.disabled = false;
            clickedBtn.innerHTML = originalHtml;
        }
    }
}

async function submitDeleteBm(bmId, clickedBtn) {
    if (!confirm(`Are you sure you want to delete BM with ID: ${bmId}? This cannot be undone.`)) return;

    const originalHtml = clickedBtn ? clickedBtn.innerHTML : '';
    if (clickedBtn) {
        clickedBtn.disabled = true;
        clickedBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    }

    try {
        const res = await apiFetch(`${API_BASE}/manageBms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', bmId })
        });
        if (!res.ok) throw new Error(await res.text());
        loadBmsList();
    } catch (e) {
        alert("Error deleting BM: " + e.message);
        if (clickedBtn) {
            clickedBtn.disabled = false;
            clickedBtn.innerHTML = originalHtml;
        }
    }
}

async function loadBmActivityLogs() {
    const tbody = document.getElementById('bmLogsTableBody');
    tbody.innerHTML = `<tr><td colspan="4"><div class="loading-spinner"></div></td></tr>`;

    try {
        const res = await apiFetch(`${API_BASE}/manageBms?action=logs`);
        if (!res.ok) throw new Error(await res.text());
        const logs = await res.json();
        renderBmActivityLog(logs);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="no-results"><p>Error: ${e.message}</p></td></tr>`;
    }
}

function renderBmActivityLog(logs) {
    const tbody = document.getElementById('bmLogsTableBody');
    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="no-results"><p>No activity logs found yet.</p></td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const ts = formatBeijingDT(new Date(log.timestamp));
        let actionLabel = '';
        let detailsHtml = '';

        if (log.action === 'create_student') {
            actionLabel = '<span class="badge badge-complete">Created Student</span>';
            detailsHtml = `Student ID: <code>${log.details.studentId}</code>, Name: <strong>${log.details.studentName}</strong>`;
        } else if (log.action === 'update_student') {
            actionLabel = '<span class="badge badge-active">Updated Student</span>';
            const changeItems = [];
            const changes = log.details.changes || {};
            for (const field of Object.keys(changes)) {
                let fromVal = changes[field].from;
                let toVal = changes[field].to;
                if (typeof fromVal === 'object') fromVal = JSON.stringify(fromVal);
                if (typeof toVal === 'object') toVal = JSON.stringify(toVal);
                changeItems.push(`<li><code>${field}</code>: <span style="text-decoration: line-through; color: var(--dash-danger);">${fromVal ?? 'none'}</span> → <span style="color: var(--dash-accent); font-weight: bold;">${toVal ?? 'none'}</span></li>`);
            }
            detailsHtml = `
                <div>Student: <strong>${log.details.studentName}</strong> (<code>${log.details.studentId}</code>)</div>
                <ul style="margin: 4px 0 0 15px; padding: 0; font-size: 0.8rem; line-height: 1.3;">
                    ${changeItems.join('')}
                </ul>
            `;
        }

        return `<tr>
            <td style="font-size:0.8rem; white-space: nowrap;">${ts}</td>
            <td><code>${log.bmId}</code></td>
            <td>${actionLabel}</td>
            <td style="font-size:0.85rem;">${detailsHtml}</td>
        </tr>`;
    }).join('');
}

