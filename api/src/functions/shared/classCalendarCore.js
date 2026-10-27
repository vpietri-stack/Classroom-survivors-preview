/* Shared Beijing-time calendar and target rules; loaded by both the dashboard and Functions. */
(function (root, factory) {
    const core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core;
    else root.ClassCalendarCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const DAY = 86400000;
    const START_DATE = '2026-10-12';
    function beijingDate(value) {
        return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
    }
    function localInput(value) {
        return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
    }
    function iso(value) {
        const date = new Date(value + ':00+08:00');
        if (!Number.isFinite(date.getTime())) throw new Error('Invalid Beijing date/time');
        return date.toISOString();
    }
    function addDays(value, days) { return new Date(new Date(value).getTime() + days * DAY).toISOString(); }
    function groupKey(teacher, classTime) { return JSON.stringify([teacher || '', classTime || '']); }
    function targetCountKey(target) {return target.id || JSON.stringify([target.startTime,target.endTime,target.targetSessions,target.manualOffset || 0]);}
    // One account can attend several groups. The legacy fields remain its primary group.
    function memberships(student) {
        const groups = [{teacher: student.teacher || '', classTime: student.classTime || ''}, ...(student.classGroups || [])];
        const unique = new Map();
        for (const g of groups) {
            const teacher = (g.teacher || '').trim(), classTime = (g.classTime || '').trim();
            if (!teacher && !classTime && groups.length > 1) continue;
            unique.set(groupKey(teacher, classTime), {teacher, classTime});
        }
        return [...unique.values()];
    }
    function belongsTo(student, teacher, classTime) {
        return memberships(student).some(g => (!teacher || g.teacher === teacher) && (!classTime || g.classTime === classTime));
    }
    function targetGroupKey(student, target) {
        if (target.groupKey) return target.groupKey;
        const groups = memberships(student);
        if (groups.length === 1) return groupKey(groups[0].teacher, groups[0].classTime);
        // Legacy manual targets normally end at the next class. Only infer an unambiguous match.
        const end = new Date(+new Date(target.endTime) + 8 * 3600000);
        const candidates = groups.filter(g => {
            const slot = parseClassTime(g.classTime);
            return slot && slot.day === end.getUTCDay();
        });
        const exact = candidates.filter(g => {
            const slot = parseClassTime(g.classTime);
            return slot.hour === end.getUTCHours() && slot.minute === end.getUTCMinutes();
        });
        const match = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
        return match ? groupKey(match.teacher, match.classTime) : null;
    }
    function targetBelongsTo(student, target, key) {
        // Accounts lacking any placement are retained for the old single-group API contract.
        return targetGroupKey(student, target) === key || (!target.groupKey && !student.teacher && !student.classTime && !(student.classGroups || []).length);
    }
    function parseClassTime(value) {
        const match = /^(Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?)\s+(\d{1,2}):(\d{2})$/i.exec((value || '').trim());
        if (!match || +match[2] > 23 || +match[3] > 59) return null;
        return { day: ['sun','mon','tue','wed','thu','fri','sat'].indexOf(match[1].slice(0,3).toLowerCase()), hour: +match[2], minute: +match[3] };
    }
    function occurrences(group, from, to) {
        const slot = parseClassTime(group.classTime);
        if (!slot) return [];
        const result = [];
        for (let date = new Date(from + 'T00:00:00Z'); date.toISOString().slice(0,10) <= to; date = new Date(+date + DAY)) {
            if (date.getUTCDay() !== slot.day) continue;
            const day = date.toISOString().slice(0,10);
            const startTime = iso(`${day}T${String(slot.hour).padStart(2,'0')}:${String(slot.minute).padStart(2,'0')}`);
            result.push({ groupKey: groupKey(group.teacher, group.classTime), teacher: group.teacher || '', classTime: group.classTime,
                startTime, endTime: new Date(+new Date(startTime) + 90 * 60000).toISOString(), studentIds: [...group.studentIds], status: 'scheduled' });
        }
        return result;
    }
    function shortLoss(e) {
        if (e.type !== 'session' || !e.data || e.sessionType === 'study') return false;
        const since = +new Date('2026-07-27T00:00:00+08:00');
        if (e.sessionType === 'vampireSurvivors' || e.sessionType === 'vampire') {
            return !e.data.won && +new Date(e.timestamp) >= since && (e.data.survivalTimeSec || 0) < 120;
        }
        if (e.data.ignored === true) return true;
        if (+new Date(e.timestamp) < since) return false;
        const loss = e.sessionType === 'gomoku' ? e.data.result !== 'win' : e.sessionType === 'uno' ? e.data.winner !== 0 : false;
        return loss && typeof e.data.totalTimeSec === 'number' && e.data.totalTimeSec < 120;
    }
    function countPractice(events, target, cutoff) {
        const seen = new Set();
        const start = +new Date(target.startTime), end = Math.min(+new Date(target.endTime), cutoff || Infinity);
        return (events || []).filter(e => {
            const key = e.eventId || `${e.type}:${e.sessionType}:${e.timestamp}`;
            if (seen.has(key)) return false;
            seen.add(key);
            const ts = +new Date(e.timestamp);
            return e.type === 'session' && !shortLoss(e) && ts >= start && ts <= end;
        }).length + (Number(target.manualOffset) || 0);
    }
    function previousTarget(targets, event) {
        // Use the period immediately before this class, never a later period created by a late entry.
        return (targets || []).filter(t => +new Date(t.startTime) < +new Date(event.startTime))
            .sort((a,b) => +new Date(b.endTime) - +new Date(a.endTime))[0];
    }
    function updateTargets(student, event, status, nextClass, events) {
        let targets = (student.targets || []).map(t => ({ ...t }));
        const key = event.groupKey || groupKey(event.teacher, event.classTime);
        const sameGroup = t => targetBelongsTo(student, t, key);
        const previous = previousTarget(targets.filter(sameGroup), event);
        if (status === 'cancelled') {
            if (previous) {
                previous.groupKey = key;
                previous.endTime = addDays(previous.endTime, 7);
                previous.targetSessions = Number(previous.targetSessions) + 10;
            }
            return targets;
        }
        if (!nextClass || +new Date(nextClass.startTime) <= +new Date(event.endTime)) throw new Error('Schedule a following class before recording attendance.');
        const extend = status === 'missed' && previous && countPractice(events, previous, +new Date(event.startTime)) >= previous.targetSessions;
        if (extend) {
            previous.groupKey = key;
            previous.targetSessions += 10;
            previous.endTime = nextClass.startTime;
            targets = targets.filter(t => t === previous || !sameGroup(t) || !(+new Date(t.startTime) >= +new Date(event.endTime) && +new Date(t.startTime) < +new Date(nextClass.startTime)));
        } else {
            // Preserve the previous period as history, replace any preassigned overlapping next period.
            if (previous) {
                previous.groupKey = key;
                // An earlier reschedule must not leave the old period active over the new one.
                if (+new Date(previous.endTime) > +new Date(event.startTime)) previous.endTime = event.startTime;
            }
            targets = targets.filter(t => !sameGroup(t) || !(+new Date(t.startTime) >= +new Date(event.endTime) && +new Date(t.startTime) < +new Date(nextClass.startTime)));
            targets.push({ id: `attendance_${event.id}`, groupKey: key, startTime: event.endTime, endTime: nextClass.startTime, targetSessions: 10, manualOffset: 0 });
        }
        return targets;
    }
    function attendanceStats(student, from, to) {
        const records = (student.attendance || []).filter(r => {
            const day = beijingDate(r.startTime);
            return r.status !== 'cancelled' && (!from || day >= from) && (!to || day <= to);
        });
        const attended = records.filter(r => r.status === 'attended').length;
        return { attended, recorded: records.length, rate: records.length ? Math.round(attended / records.length * 100) : null, records };
    }
    return { DAY, START_DATE, beijingDate, localInput, iso, addDays, groupKey, targetCountKey, memberships, belongsTo, targetGroupKey, targetBelongsTo, parseClassTime, occurrences, shortLoss, countPractice, previousTarget, updateTargets, attendanceStats };
});
