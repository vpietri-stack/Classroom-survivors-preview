// These keys have no independent regular curriculum entry.
const retiredVocab = [
    'get there', 'real name', 'rose garden', 'glass palace', 'call it',
    'feel sad', 'winning', 'fall / falls', 'call', 'call / calls to someone',
    'help her to stand', 'pyramid', 'point north', 'metal needle', 'rub',
    'the sun rises', 'the sun sets'
];

function pruneRetiredVocab(srState) {
    if (!srState?.vocab || !retiredVocab.some(key => Object.hasOwn(srState.vocab, key))) return srState;
    const vocab = { ...srState.vocab };
    for (const key of retiredVocab) delete vocab[key];
    return { ...srState, vocab };
}

module.exports = { pruneRetiredVocab };
