// Shared curriculum and SR selection for the mixed non-spelling round.
(() => {
    'use strict';
    const catalog = {
        missing: [
            { id: 'M1', sentences: ['I washed my hands ___ I ate lunch.', 'I ate lunch ___ I washed my hands.'], answers: ['before', 'after'] },
            { id: 'M2', sentences: ['He put on his socks ___ he put on his shoes.', 'He put on his shoes ___ he put on his socks.'], answers: ['before', 'after'] },
            { id: 'M3', sentences: ['We bought tickets ___ we went into the cinema.', 'We went into the cinema ___ we bought tickets.'], answers: ['before', 'after'] },
            { id: 'M4', sentences: ['She dried her hair ___ she had a shower.', 'She had a shower ___ she dried her hair.'], answers: ['after', 'before'] },
            { id: 'M5', sentences: ['I cleaned my teeth ___ I went to bed.', 'I laughed ___ I heard the funny joke.'], answers: ['before', 'when'] },
            { id: 'M6', sentences: ['He had breakfast ___ he got dressed.', 'I waved ___ I saw my friend.'], answers: ['after', 'when'] }
        ],
        fix: [
            { id: 'F1', sentence: 'I washed my hands after I ate lunch.', wrongWord: 'after', answer: 'before' },
            { id: 'F2', sentence: 'He put on his shoes before he put on his socks.', wrongWord: 'before', answer: 'after' },
            { id: 'F3', sentence: 'We bought tickets after we went into the cinema.', wrongWord: 'after', answer: 'before' },
            { id: 'F4', sentence: 'She dried her hair before she had a shower.', wrongWord: 'before', answer: 'after' },
            { id: 'F5', sentence: 'I laughed before I heard the funny joke.', wrongWord: 'before', answer: 'when' },
            { id: 'F6', sentence: 'I waved before I saw my friend.', wrongWord: 'before', answer: 'when' },
            { id: 'F7', sentence: 'He put on his socks when he put on his shoes.', wrongWord: 'when', answer: 'before' },
            { id: 'F8', sentence: 'She dried her hair when she had a shower.', wrongWord: 'when', answer: 'after' }
        ]
    };

    // Approved Unit 1 boards remain grouped under the existing page 16 entry.
    const unit1Catalog = {
        missing: [
            { id: 'M1', sentences: ["It's 7:30. It's half ___ seven.", "It's twelve o'clock at night. It's ___."], answers: ['past', 'midnight'] },
            { id: 'M2', sentences: ["I have breakfast ___ seven o'clock.", 'We practise ___ Mondays.'], answers: ['at', 'on'] },
            { id: 'M3', sentences: ['___ do you live? In Russia.', "___ are you running? Because I'm late."], answers: ['where', 'why'] },
            { id: 'M4', sentences: ['___ helps you with your homework? My brother.', '___ many acrobats are there? Four.'], answers: ['who', 'how'] },
            { id: 'M5', sentences: ['She is ___ on one leg.', 'They are ___ up as clowns.'], answers: ['hopping', 'dressing'] },
            { id: 'M7', sentences: ['When I ___ four, I could hop.', 'When we ___ six, we could skip.'], answers: ['was', 'were'] },
            { id: 'M8', sentences: ['I ___ hop on one leg when I was four.', "I couldn't ___ a bike when I was two."], answers: ['could', 'ride'] },
            { id: 'M11', sentences: ['Anastasia practises ___ day.', 'She performs ___ stage.'], answers: ['every', 'on'] },
            { id: 'M12', sentences: ['The clowns ___ dancing.', 'The boy ___ clapping.'], answers: ['are', 'is'] },
            { id: 'M13', sentences: ['___ is your favourite sport? Tennis.', '___ do you practise? On Saturdays.'], answers: ['what', 'when'] },
            { id: 'M14', sentences: ['___ bag is yours: the red one or the blue one? The red one.', "___ bag is this? It's Lily's."], answers: ['which', 'whose'] },
            { id: 'M15', sentences: ["___ old is your brother? He's ten.", '___ is your teacher? Mr Friendly.'], answers: ['how', 'who'] },
            { id: 'M16', sentences: ['___ are my shoes? Under the bed.', '___ do acrobats practise? Because they want to improve.'], answers: ['where', 'why'] },
            { id: 'M17', sentences: ['I ___ five when I could ride a bike.', 'My brothers ___ seven when they could climb trees.'], answers: ['was', 'were'] },
            { id: 'M18', sentences: ['He ___ three when he could hop.', 'They ___ six when they could skip.'], answers: ['was', 'were'] },
            { id: 'M19', sentences: ['I ___ ride a bike when I was two,', 'but I ___ do it now.'], answers: ["couldn't", 'can'] },
            { id: 'M20', sentences: ['My grandma ___ do gymnastics when she was eighteen,', 'but she ___ do it anymore.'], answers: ['could', "can't"] },
            { id: 'M21', sentences: ["I couldn't ___ in the swimming pool when I was two.", 'I could ___ a bike when I was six.'], answers: ['swim', 'ride'] },
            { id: 'M22', sentences: ['I ___ swim when I was two,', 'but after lots of practice I ___ swim now.'], answers: ["couldn't", 'can'] },
            { id: 'M23', sentences: ['My grandpa ___ climb trees when he was young,', 'but he ___ climb them anymore.'], answers: ['could', "can't"] }
        ],
        fix: [
            { id: 'F1', sentence: "It's 7:30. It's half to seven.", wrongWord: 'to', answer: 'past' },
            { id: 'F2', sentence: "It's twelve o'clock at night. It's midday.", wrongWord: 'midday', answer: 'midnight' },
            { id: 'F3', sentence: 'When do you live? In Russia.', wrongWord: 'when', answer: 'where' },
            { id: 'F4', sentence: "Who are you running? Because I'm late.", wrongWord: 'who', answer: 'why' },
            { id: 'F5', sentence: 'The acrobats is practising.', wrongWord: 'is', answer: 'are' },
            { id: 'F6', sentence: 'The clown is climb a ladder.', wrongWord: 'climb', answer: 'climbing' },
            { id: 'F7', sentence: 'I were four when I could hop on one leg.', wrongWord: 'were', answer: 'was' },
            { id: 'F8', sentence: 'Could you swimming when you were five?', wrongWord: 'swimming', answer: 'swim' },
            { id: 'F11', sentence: 'Anastasia practises every days.', wrongWord: 'days', answer: 'day' },
            { id: 'F12', sentence: 'There are thirteen clown in the circus.', wrongWord: 'clown', answer: 'clowns' },
            { id: 'F13', sentence: 'Where colour is your bag? Blue.', wrongWord: 'where', answer: 'what' },
            { id: 'F14', sentence: "Who's bag is this? It's Lily's.", wrongWord: "who's", answer: 'whose' },
            { id: 'F15', sentence: 'Why many clowns are there? Three.', wrongWord: 'why', answer: 'how' },
            { id: 'F16', sentence: 'Who do you practise? On Saturdays.', wrongWord: 'who', answer: 'when' },
            { id: 'F17', sentence: 'We was six when we could skip.', wrongWord: 'was', answer: 'were' },
            { id: 'F18', sentence: 'He were five when he could swim.', wrongWord: 'were', answer: 'was' },
            { id: 'F19', sentence: 'You is very good at climbing.', wrongWord: 'is', answer: 'are' },
            { id: 'F20', sentence: 'She are dressing up as a clown.', wrongWord: 'are', answer: 'is' },
            { id: 'F21', sentence: "I can't ride a bike when I was two, but I can do it now.", wrongWord: "can't", answer: "couldn't" },
            { id: 'F22', sentence: "My grandma could do gymnastics when she was eighteen, but she couldn't do it anymore now.", wrongWord: "couldn't", answer: "can't" },
            { id: 'F23', sentence: "I couldn't swim when I was two, but after lots of practice I could swim now.", wrongWord: 'could', answer: 'can' },
            { id: 'F24', sentence: "My grandpa can climb trees when he was young, but he can't climb them anymore.", wrongWord: 'can', answer: 'could' }
        ]
    };
    const unit2Catalog = {
        missing: [
            { id: 'M1', sentences: ["She's the woman ___ makes the noodles.", 'This is the sauce ___ we put on pancakes.'], answers: ['who', 'which'] },
            { id: 'M2', sentences: ['This is the café ___ we have breakfast.', 'These are the pancakes ___ we ate.'], answers: ['where', 'which'] },
            { id: 'M3', sentences: ["He's the man ___ taught me to swim.", "That's the pool ___ I learned to swim."], answers: ['who', 'where'] },
            { id: 'M4', sentences: ['This is the woman ___ works in the café.', 'This is the camera ___ I use to take photos.', 'This is the café ___ we eat.'], answers: ['who', 'which', 'where'] },
            { id: 'M5', sentences: ['This is the restaurant ___ we ate noodles.', 'This is the woman ___ cooked them.', 'These are the noodles ___ she cooked.'], answers: ['where', 'who', 'which'] },
            { id: 'M6', sentences: ['This is the photo ___ I took yesterday.', 'This is the boy ___ took the photo.'], answers: ['which', 'who'] },
            { id: 'M7', sentences: ['Yesterday, Dad ___ our car to town.', 'Last night, I ___ an email to Grandma.'], answers: ['drove', 'wrote'] },
            { id: 'M8', sentences: ['Last year, she ___ English at my school.', 'Yesterday, Dad ___ me a milkshake.'], answers: ['taught', 'gave'] },
            { id: 'M9', sentences: ['We ___ a film at the cinema yesterday.', 'I ___ a photo with my camera yesterday.'], answers: ['saw', 'took'] },
            { id: 'M10', sentences: ['They ___ a tree house last summer.', 'My grandma ___ up in a small village.'], answers: ['built', 'grew'] },
            { id: 'M11', sentences: ['We ___ noodles for lunch yesterday.', 'Grandpa ___ me a story last night.'], answers: ['had', 'told'] },
            { id: 'M12', sentences: ['___ you see the film yesterday?', '___ your sister like pancakes now?'], answers: ['did', 'does'] },
            { id: 'M13', sentences: ["We didn't ___ a tree house yesterday.", 'We ___ one last summer.'], answers: ['build', 'built'] },
            { id: 'M14', sentences: ["She didn't ___ the email yesterday.", 'She ___ it this morning.'], answers: ['write', 'wrote'] },
            { id: 'M15', sentences: ['___ we finished lunch, we went to the funfair.', 'This is the funfair ___ we went after lunch.'], answers: ['when', 'where'] },
            { id: 'M16', sentences: ['When the bus ___, we got on it.', 'When we ___ lunch, we went to the funfair.'], answers: ['arrived', 'finished'] }
        ],
        fix: [
            { id: 'F1', sentence: "She's the woman which makes the noodles.", wrongWord: 'which', answer: 'who' },
            { id: 'F2', sentence: 'This is the café which we have breakfast.', wrongWord: 'which', answer: 'where' },
            { id: 'F3', sentence: 'This is the camera where I use to take photos.', wrongWord: 'where', answer: 'which' },
            { id: 'F4', sentence: "He's the teacher where helped me with my homework.", wrongWord: 'where', answer: 'who' },
            { id: 'F5', sentence: "That's the restaurant who sells pancakes.", wrongWord: 'who', answer: 'which' },
            { id: 'F6', sentence: 'This is the kitchen who my grandma cooks.', wrongWord: 'who', answer: 'where' },
            { id: 'F7', sentence: 'Yesterday, Dad drive our car to town.', wrongWord: 'drive', answer: 'drove' },
            { id: 'F8', sentence: 'She writed an email last night.', wrongWord: 'writed', answer: 'wrote' },
            { id: 'F9', sentence: "He's the teacher who teaches me English last year.", wrongWord: 'teaches', answer: 'taught' },
            { id: 'F10', sentence: 'He gived me a bowl of noodles yesterday.', wrongWord: 'gived', answer: 'gave' },
            { id: 'F11', sentence: 'This is the tree house which they build last summer.', wrongWord: 'build', answer: 'built' },
            { id: 'F12', sentence: "We didn't saw the film yesterday.", wrongWord: 'saw', answer: 'see' },
            { id: 'F13', sentence: 'Did she took a photo?', wrongWord: 'took', answer: 'take' },
            { id: 'F14', sentence: "My dad didn't drove to work yesterday.", wrongWord: 'drove', answer: 'drive' },
            { id: 'F15', sentence: 'We were happy who the bus arrived.', wrongWord: 'who', answer: 'when' },
            { id: 'F16', sentence: 'When we finished lunch yesterday, we go to the funfair.', wrongWord: 'go', answer: 'went' },
            { id: 'F17', sentence: 'We have noodles for lunch yesterday.', wrongWord: 'have', answer: 'had' },
            { id: 'F18', sentence: 'Mum taked a photo yesterday.', wrongWord: 'taked', answer: 'took' },
            { id: 'F19', sentence: 'My grandma grows up in this village when she was a child.', wrongWord: 'grows', answer: 'grew' },
            { id: 'F20', sentence: 'Grandpa telled me a story last night.', wrongWord: 'telled', answer: 'told' }
        ]
    };
    const unit3Catalog = {
        missing: [
            { id: 'M1', sentences: ['Jenny is ___ than Jim.', 'Jenny is the ___ of the three children.'], answers: ['taller', 'tallest'] },
            { id: 'M2', sentences: ['Ivan is the ___ of all the acrobats.', 'Ivan is ___ than Jim.'], answers: ['strongest', 'stronger'] },
            { id: 'M3', sentences: ['My sister runs ___ than me.', 'She is the ___ runner in our whole school.'], answers: ['faster', 'fastest'] },
            { id: 'M4', sentences: ['This is the ___ of the three boxes.', 'This box is ___ than that one.'], answers: ['biggest', 'bigger'] },
            { id: 'M5', sentences: ['This mouse is ___ than that mouse.', 'This is the ___ of the three mice.'], answers: ['smaller', 'smallest'] },
            { id: 'M6', sentences: ['This is the ___ dangerous of all these sports.', 'This sport is ___ dangerous than tennis.'], answers: ['most', 'more'] },
            { id: 'M7', sentences: ['My drawing is ___ than yours.', 'This is the ___ of all my drawings.'], answers: ['better', 'best'] },
            { id: 'M8', sentences: ['This is the ___ of the three films.', 'This film is ___ than that one.'], answers: ['worst', 'worse'] },
            { id: 'M9', sentences: ['Jim is as tall ___ Jenny.', 'Ivan is taller ___ Jim.'], answers: ['as', 'than'] },
            { id: 'M10', sentences: ['Jenny is taller than Jim, so Jim is ___ as tall as Jenny.', "I'm ___ tall as my brother."], answers: ['not', 'as'] },
            { id: 'M11', sentences: ['I want ___ play football.', 'She ___ to play tennis.'], answers: ['to', 'wants'] },
            { id: 'M12', sentences: ['He ___ to see a doctor.', 'We need ___ do our homework.'], answers: ['needs', 'to'] },
            { id: 'M13', sentences: ['I ___ to go to the party.', 'My sister ___ to go too.'], answers: ['want', 'wants'] },
            { id: 'M14', sentences: ['Tom ___ to finish his homework.', 'They ___ to finish theirs.'], answers: ['needs', 'need'] },
            { id: 'M15', sentences: ['Your arm bends at your ___.', 'Your leg bends at your ___.'], answers: ['elbow', 'knee'] },
            { id: 'M16', sentences: ['We wear shoes on our ___.', 'We wear gloves on our ___.'], answers: ['feet', 'hands'] },
            { id: 'M17', sentences: ['Ivan is ___ strongest man in the circus.', 'Ivan is stronger ___ Jim.'], answers: ['the', 'than'] },
            { id: 'M18', sentences: ['Jenny is taller ___ Jim.', 'Jenny is ___ tallest of the three children.'], answers: ['than', 'the'] },
            { id: 'M19', sentences: ['Jim is ___ tall as Jenny.', 'Ivan is ___ strongest of all the acrobats.'], answers: ['as', 'the'] },
            { id: 'M20', sentences: ['My bag is heavier ___ yours.', "Your bag isn't as heavy ___ mine."], answers: ['than', 'as'] },
            { id: 'M21', sentences: ['This is ___ biggest of the three boxes.', 'This box is bigger ___ that one.', 'This box is ___ big as yours.'], answers: ['the', 'than', 'as'] },
            { id: 'M22', sentences: ['My brother is ___ tall ___ me.', 'My sister is taller ___ me.', 'She is ___ tallest of the three of us.'], answers: ['as', 'as', 'than', 'the'] }
        ],
        fix: [
            { id: 'F1', sentence: 'Jenny is tallest than Jim.', wrongWord: 'tallest', answer: 'taller' },
            { id: 'F2', sentence: 'Ivan is the stronger of all the acrobats.', wrongWord: 'stronger', answer: 'strongest' },
            { id: 'F3', sentence: 'This box is big than that one.', wrongWord: 'big', answer: 'bigger' },
            { id: 'F4', sentence: 'This is the smaller of all the boxes.', wrongWord: 'smaller', answer: 'smallest' },
            { id: 'F5', sentence: 'This animal is most dangerous than that one.', wrongWord: 'most', answer: 'more' },
            { id: 'F6', sentence: 'This is the more beautiful of all the flowers.', wrongWord: 'more', answer: 'most' },
            { id: 'F7', sentence: 'Jim is as tall than Jenny.', wrongWord: 'than', answer: 'as' },
            { id: 'F8', sentence: "I'm not than strong as Ivan.", wrongWord: 'than', answer: 'as' },
            { id: 'F9', sentence: 'My drawing is good than yours.', wrongWord: 'good', answer: 'better' },
            { id: 'F10', sentence: 'This is the worse of all my drawings.', wrongWord: 'worse', answer: 'worst' },
            { id: 'F11', sentence: 'I want to playing football.', wrongWord: 'playing', answer: 'play' },
            { id: 'F12', sentence: 'She needs to resting her ankle.', wrongWord: 'resting', answer: 'rest' },
            { id: 'F13', sentence: 'He want to go to the party.', wrongWord: 'want', answer: 'wants' },
            { id: 'F14', sentence: 'They needs to do their homework.', wrongWord: 'needs', answer: 'need' },
            { id: 'F15', sentence: 'I need for see a doctor.', wrongWord: 'for', answer: 'to' },
            { id: 'F16', sentence: "She doesn't wants to go to the party.", wrongWord: 'wants', answer: 'want' },
            { id: 'F17', sentence: 'I hurt both my knee.', wrongWord: 'knee', answer: 'knees' },
            { id: 'F18', sentence: 'My fingers hurts.', wrongWord: 'hurts', answer: 'hurt' },
            { id: 'F19', sentence: "I've got a sore throats.", wrongWord: 'throats', answer: 'throat' },
            { id: 'F20', sentence: "I've got a headache, but I wants to play football.", wrongWord: 'wants', answer: 'want' },
            { id: 'F21', sentence: 'Ivan is than strongest man in the circus.', wrongWord: 'than', answer: 'the' },
            { id: 'F22', sentence: 'Jenny is taller the Jim.', wrongWord: 'the', answer: 'than' },
            { id: 'F23', sentence: 'Jim is the tall as Jenny.', wrongWord: 'the', answer: 'as' },
            { id: 'F24', sentence: 'My bag is as heavy than yours.', wrongWord: 'than', answer: 'as' },
            { id: 'F25', sentence: 'This is as biggest of the three boxes.', wrongWord: 'as', answer: 'the' },
            { id: 'F26', sentence: 'This box is bigger as that one.', wrongWord: 'as', answer: 'than' },
            // F27 duplicated F8 and was explicitly excluded by the teacher.
            { id: 'F28', sentence: 'This is the most dangerous of all the sports. That sport is more dangerous the swimming.', wrongWord: 'the', wrongIndex: 14, answer: 'than' }
        ]
    };
    const unit4Catalog = {
        missing: [
            {"id": "M1", "sentences": ["She's a ___ singer.", "She sings ___."], "answers": ["beautiful", "beautifully"], "prefixes": ["b", "b"]},
            {"id": "M2", "sentences": ["He speaks more ___ than me.", "He's a ___ boy."], "answers": ["quietly", "quiet"], "prefixes": ["q", "q"]},
            {"id": "M3", "sentences": ["She's a ___ climber.", "She climbs more ___ than me."], "answers": ["careful", "carefully"], "prefixes": ["c", "c"]},
            {"id": "M4", "sentences": ["He's a ___ walker.", "He walks more ___ than me."], "answers": ["slow", "slowly"], "prefixes": ["s", "s"]},
            {"id": "M5", "sentences": ["She runs more ___ than me.", "She's a ___ runner."], "answers": ["quickly", "quick"], "prefixes": ["q", "q"]},
            {"id": "M6", "sentences": ["He's a ___ footballer.", "He plays football ___."], "answers": ["good", "well"], "prefixes": ["g", "w"]},
            {"id": "M7", "sentences": ["He's a very ___ runner.", "He runs ___ than me."], "answers": ["fast", "faster"], "prefixes": ["f", "f"]},
            {"id": "M8", "sentences": ["He works ___ than me.", "He's a very ___ worker."], "answers": ["harder", "hard"], "prefixes": ["h", "h"]},
            {"id": "M9", "sentences": ["She sings ___ beautifully than me.", "He runs more quickly ___ me."], "answers": ["more", "than"]},
            {"id": "M10", "sentences": ["Jim climbs ___ than Tom.", "Tom works more ___ than Jim."], "answers": ["better", "carefully"], "prefixes": ["b", "c"]},
            {"id": "M11", "sentences": ["We played very ___ today.", "They played ___ than us."], "answers": ["well", "worse"], "prefixes": ["w", "w"]},
            {"id": "M12", "sentences": ["I didn't ___ the ball yesterday.", "My brother ___ it."], "answers": ["catch", "caught"], "prefixes": ["c", "c"]},
            {"id": "M13", "sentences": ["I didn't ___ the ball.", "My sister ___ it."], "answers": ["throw", "threw"], "prefixes": ["t", "t"]},
            {"id": "M14", "sentences": ["Birds can ___ high in the sky.", "Yesterday, they ___ over our house."], "answers": ["fly", "flew"]},
            {"id": "M15", "sentences": ["I can ___ new songs quickly.", "Last year, I ___ to play the piano."], "answers": ["learn", "learnt"], "prefixes": ["l", "l"]},
            {"id": "M16", "sentences": ["My sister dances as beautifully ___ my mum.", "I dance more slowly ___ my brother."], "answers": ["as", "than"]}
        ],
        fix: [
            {"id": "F1", "sentence": "She sings beautiful.", "wrongWord": "beautiful", "answer": "beautifully"},
            {"id": "F2", "sentence": "He is a quietly boy.", "wrongWord": "quietly", "answer": "quiet"},
            {"id": "F3", "sentence": "She's a loudly singer.", "wrongWord": "loudly", "answer": "loud"},
            {"id": "F4", "sentence": "He is a slowly walker.", "wrongWord": "slowly", "answer": "slow"},
            {"id": "F5", "sentence": "He's a quickly runner.", "wrongWord": "quickly", "answer": "quick"},
            {"id": "F6", "sentence": "He is a carefully driver.", "wrongWord": "carefully", "answer": "careful"},
            {"id": "F7", "sentence": "She plays tennis good.", "wrongWord": "good", "answer": "well"},
            {"id": "F8", "sentence": "He runs fastly.", "wrongWord": "fastly", "answer": "fast"},
            {"id": "F9", "sentence": "He works hard than me.", "wrongWord": "hard", "answer": "harder"},
            {"id": "F10", "sentence": "He can run more fast than me.", "wrongWord": "fast", "answer": "quickly"},
            {"id": "F11", "sentence": "She climbs more careful than me.", "wrongWord": "careful", "answer": "carefully"},
            {"id": "F12", "sentence": "She sings more beautiful than me.", "wrongWord": "beautiful", "answer": "beautifully"},
            {"id": "F13", "sentence": "He plays football well than me.", "wrongWord": "well", "answer": "better"},
            {"id": "F14", "sentence": "She dances more beautifully then me.", "wrongWord": "then", "answer": "than"},
            {"id": "F15", "sentence": "He can run quickly than me.", "wrongWord": "quickly", "answer": "faster"},
            {"id": "F16", "sentence": "They play tennis badly than us.", "wrongWord": "badly", "answer": "worse"},
            {"id": "F17", "sentence": "We didn't caught any fish.", "wrongWord": "caught", "answer": "catch"},
            {"id": "F18", "sentence": "Did she threw the ball?", "wrongWord": "threw", "answer": "throw"},
            {"id": "F19", "sentence": "The birds flyed over the lake yesterday.", "wrongWord": "flyed", "answer": "flew"},
            {"id": "F20", "sentence": "We learn to dance last week.", "wrongWord": "learn", "answer": "learnt"}
        ]
    };
    const unit5Catalogs = {
        57: {
            missing: [
                {"id": "M1", "sentences": ["Her shirt has stripes. It's ___.", "His hat has spots. It's ___."], "answers": ["striped", "spotted"], "prefixes": ["s", "s"]},
                {"id": "M2", "sentences": ["Her spotted dress has yellow ___.", "His striped trousers have blue ___."], "answers": ["spots", "stripes"], "prefixes": ["s", "s"]},
                {"id": "M3", "sentences": ["This blue is very pale. It's ___ blue.", "This blue is almost black. It's ___ blue."], "answers": ["light", "dark"], "prefixes": ["l", "d"]}
            ],
            fix: [
                {"id": "F1", "sentence": "He's wearing a stripes shirt.", "wrongWord": "stripes", "answer": "striped"},
                {"id": "F2", "sentence": "Her dress has white spotted.", "wrongWord": "spotted", "answer": "spots"},
                {"id": "F3", "sentence": "She's wear a bright orange jacket.", "wrongWord": "wear", "answer": "wearing"},
                {"id": "F4", "sentence": "His trousers is dark blue.", "wrongWord": "is", "answer": "are"}
            ]
        },
        59: {
            missing: [
                {"id": "M4", "sentences": ["The helmet ___ made of gold.", "The wings ___ made of paper."], "answers": ["is", "are"]},
                {"id": "M5", "sentences": ["What ___ your watch made of?", "What ___ these bowls made of?"], "answers": ["is", "are"]},
                {"id": "M6", "sentences": ["The boots are ___ of rubber.", "The diary is made ___ paper."], "answers": ["made", "of"]},
                {"id": "M7", "sentences": ["This book has pages made of ___.", "These boots are made of ___."], "answers": ["paper", "rubber"], "prefixes": ["p", "r"]}
            ],
            fix: [
                {"id": "F5", "sentence": "The helmet are made of gold.", "wrongWord": "are", "answer": "is"},
                {"id": "F6", "sentence": "The wings is made of paper.", "wrongWord": "is", "answer": "are"},
                {"id": "F7", "sentence": "The boots are make of rubber.", "wrongWord": "make", "answer": "made"},
                {"id": "F8", "sentence": "The diary is made for paper.", "wrongWord": "for", "answer": "of"},
                {"id": "F9", "sentence": "What does your watch made of?", "wrongWord": "does", "answer": "is"},
                {"id": "F10", "sentence": "What is the bowls made of?", "wrongWord": "is", "answer": "are"}
            ]
        },
        66: {
            missing: [
                {"id": "M8", "sentences": ["This table is made of ___.", "This warm scarf is made of ___."], "answers": ["wood", "wool"], "prefixes": ["w", "w"]},
                {"id": "M9", "sentences": ["We can see through this window. It's made of ___.", "These scissors are made of ___."], "answers": ["glass", "metal"], "prefixes": ["g", "m"]},
                {"id": "M10", "sentences": ["We read books made of ___.", "Let's make a crown from brown ___."], "answers": ["paper", "card"], "prefixes": ["p", "c"]},
                {"id": "M11", "sentences": ["___ we make some props?", "___ paint the sky blue."], "answers": ["shall", "let's"], "prefixes": ["s", "l"]},
                {"id": "M12", "sentences": ["We ___ use yellow plastic for the sun.", "What ___ we use for the clouds?"], "answers": ["could", "shall"], "prefixes": ["c", "s"]},
                {"id": "M13", "sentences": ["Let's ___ a crown.", "We could ___ silver card."], "answers": ["make", "use"], "prefixes": ["m", "u"]},
                {"id": "M14", "sentences": ["Shall we ___ some costumes?", "Let's ___ them bright colours."], "answers": ["design", "paint"], "prefixes": ["d", "p"]},
                {"id": "M15", "sentences": ["This ruler bends easily. It is ___.", "This wooden table doesn't bend. It is ___."], "answers": ["flexible", "rigid"], "prefixes": ["f", "r"]},
                {"id": "M16", "sentences": ["This box is hard to lift. It's ___.", "This empty paper bag is easy to lift. It's ___."], "answers": ["heavy", "light"], "prefixes": ["h", "l"]}
            ],
            fix: [
                {"id": "F11", "sentence": "Shall we making some props?", "wrongWord": "making", "answer": "make"},
                {"id": "F12", "sentence": "Let's paints the sky blue.", "wrongWord": "paints", "answer": "paint"},
                {"id": "F13", "sentence": "We could using blue paper.", "wrongWord": "using", "answer": "use"},
                {"id": "F14", "sentence": "What shall we used for the clouds?", "wrongWord": "used", "answer": "use"},
                {"id": "F15", "sentence": "Shall we designs some costumes?", "wrongWord": "designs", "answer": "design"},
                {"id": "F16", "sentence": "We could went to the cinema.", "wrongWord": "went", "answer": "go"},
                {"id": "F17", "sentence": "Let's buying some silver card.", "wrongWord": "buying", "answer": "buy"},
                {"id": "F18", "sentence": "Gold is very heavily.", "wrongWord": "heavily", "answer": "heavy"},
                {"id": "F19", "sentence": "This ruler bends easily. It is rigid.", "wrongWord": "rigid", "answer": "flexible"},
                {"id": "F20", "sentence": "This stone doesn't feel smooth. It feels roughly.", "wrongWord": "roughly", "answer": "rough"}
            ]
        }
    };
    const unit6Catalogs = {
        69: {
            missing: [
                {"id": "M1", "sentences": ["We learn about countries and maps in ___.", "We learn about the past in ___."], "answers": ["geography", "history"], "prefixes": ["g", "h"]},
                {"id": "M2", "sentences": ["We work with numbers in ___.", "We sing and play instruments in ___."], "answers": ["maths", "music"], "prefixes": ["m", "m"]},
                {"id": "M3", "sentences": ["We draw and paint in ___.", "We do experiments in ___."], "answers": ["art", "science"], "prefixes": ["a", "s"]},
                {"id": "M4", "sentences": ["We've got geography ___ nine o'clock.", "We've got science ___ Monday."], "answers": ["at", "on"]},
                {"id": "M5", "sentences": ["We've got art ___ the morning.", "Lunch starts ___ half past twelve."], "answers": ["in", "at"]},
                {"id": "M6", "sentences": ["Maths is at nine, ___ our ten o'clock break.", "Art is at eleven, ___ our ten o'clock break."], "answers": ["before", "after"]}
            ],
            fix: [
                {"id": "F1", "sentence": "We've got science in nine o'clock.", "wrongWord": "in", "answer": "at"},
                {"id": "F2", "sentence": "We've got history at Monday.", "wrongWord": "at", "answer": "on"},
                {"id": "F3", "sentence": "We've got art on the morning.", "wrongWord": "on", "answer": "in"},
                {"id": "F4", "sentence": "Break starts at half to ten.", "wrongWord": "to", "answer": "past"},
                {"id": "F5", "sentence": "She's got two maths class today.", "wrongWord": "class", "answer": "classes"},
                {"id": "F6", "sentence": "What have they get at nine o'clock?", "wrongWord": "get", "answer": "got"}
            ]
        },
        71: {
            missing: [
                {"id": "M7", "sentences": ["You ___ listen carefully to your teacher.", "You ___ copy in exams."], "answers": ["should", "shouldn't"], "prefixes": ["s", "s"]},
                {"id": "M8", "sentences": ["Your friend needs help. You ___ help her.", "You've got an exam tomorrow. You ___ go to bed late."], "answers": ["should", "shouldn't"], "prefixes": ["s", "s"]},
                {"id": "M9", "sentences": ["You ___ talk when the teacher is speaking.", "You ___ put your hand up to ask a question."], "answers": ["shouldn't", "should"], "prefixes": ["s", "s"]},
                {"id": "M10", "sentences": ["You should ___ carefully to your teacher.", "You should ___ your homework before you play."], "answers": ["listen", "finish"], "prefixes": ["l", "f"]}
            ],
            fix: [
                {"id": "F7", "sentence": "You shouldn't listen carefully to your teacher.", "wrongWord": "shouldn't", "answer": "should"},
                {"id": "F8", "sentence": "You should copy other students' answers in exams.", "wrongWord": "should", "answer": "shouldn't"},
                {"id": "F9", "sentence": "You should goes to bed early before an exam.", "wrongWord": "goes", "answer": "go"},
                {"id": "F10", "sentence": "You shouldn't eating in class.", "wrongWord": "eating", "answer": "eat"},
                {"id": "F11", "sentence": "She should finishes her homework before she plays.", "wrongWord": "finishes", "answer": "finish"},
                {"id": "F12", "sentence": "Should we helps our friends?", "wrongWord": "helps", "answer": "help"}
            ]
        },
        73: {
            missing: [
                {"id": "M11", "sentences": ["You should ___ the guitar every day to get good.", "I'm good at ___ the guitar."], "answers": ["play", "playing"], "prefixes": ["p", "p"]},
                {"id": "M12", "sentences": ["She's good at ___ pictures.", "She can ___ very well."], "answers": ["drawing", "draw"], "prefixes": ["d", "d"]},
                {"id": "M13", "sentences": ["I can ___ across the pool.", "I'm good at ___."], "answers": ["swim", "swimming"], "prefixes": ["s", "s"]},
                {"id": "M14", "sentences": ["She's good ___ maths.", "We should listen ___ our teacher."], "answers": ["at", "to"]},
                {"id": "M15", "sentences": ["Katy is good at ___ poems.", "She should ___ one for the project."], "answers": ["writing", "write"], "prefixes": ["w", "w"]},
                {"id": "M16", "sentences": ["He's good at ___ photos.", "He can ___ a photo for our project."], "answers": ["taking", "take"], "prefixes": ["t", "t"]},
                {"id": "M17", "sentences": ["Use a ___ to find what a word means.", "We can find information on this ___."], "answers": ["dictionary", "website"], "prefixes": ["d", "w"]},
                {"id": "M18", "sentences": ["Use ___ to cut the paper.", "Use ___ to stick it together."], "answers": ["scissors", "glue"], "prefixes": ["s", "g"]},
                {"id": "M19", "sentences": ["This portable computer is a ___.", "The pictures appear on its ___."], "answers": ["laptop", "screen"], "prefixes": ["l", "s"]},
                {"id": "M20", "sentences": ["This ___ helps me learn English on my phone.", "I carry my books on my back in a ___."], "answers": ["app", "rucksack"], "prefixes": ["a", "r"]},
                {"id": "M21", "sentences": ["What's the ___ password? I want to go online.", "We can find information on the ___."], "answers": ["wifi", "internet"], "prefixes": ["w", "i"]},
                {"id": "M22", "sentences": ["A ___ has pages we can visit on the Internet.", "An online ___ tells us what words mean."], "answers": ["website", "dictionary"], "prefixes": ["w", "d"]},
                {"id": "M23", "sentences": ["We read an e-book on a ___.", "We turn the pages of a paper ___."], "answers": ["screen", "book"], "prefixes": ["s", "b"]},
                {"id": "M24", "sentences": ["Use scissors to ___ the paper.", "Use glue to ___ the pieces together."], "answers": ["cut", "stick"], "prefixes": ["c", "s"]},
                {"id": "M25", "sentences": ["On a computer, CTRL + C makes a ___ of the selected text.", "You can then use CTRL + V to ___ it where you want."], "answers": ["copy", "paste"], "prefixes": ["c", "p"]},
                {"id": "M26", "sentences": ["Put unwanted paper in the ___.", "Keep the paper you need in your ___."], "answers": ["bin", "rucksack"], "prefixes": ["b", "r"]}
            ],
            fix: [
                {"id": "F13", "sentence": "She's good in maths.", "wrongWord": "in", "answer": "at"},
                {"id": "F14", "sentence": "I'm good at draw pictures.", "wrongWord": "draw", "answer": "drawing"},
                {"id": "F15", "sentence": "He's good at swim.", "wrongWord": "swim", "answer": "swimming"},
                {"id": "F16", "sentence": "They're good at take photos.", "wrongWord": "take", "answer": "taking"},
                {"id": "F17", "sentence": "Katy is good at write poems.", "wrongWord": "write", "answer": "writing"},
                {"id": "F18", "sentence": "She is good at plays the guitar.", "wrongWord": "plays", "answer": "playing"},
                {"id": "F19", "sentence": "I can swimming, and I'm good at it.", "wrongWord": "swimming", "answer": "swim"},
                {"id": "F20", "sentence": "He should practising every day to get better at music.", "wrongWord": "practising", "answer": "practise"},
                {"id": "F21", "sentence": "You should use a online dictionary.", "wrongWord": "a", "answer": "an"},
                {"id": "F22", "sentence": "The bin is in the laptop screen.", "wrongWord": "in", "answer": "on"},
                {"id": "F23", "sentence": "I use my dictionary to go on the Internet and do my homework. It's a small computer.", "wrongWord": "dictionary", "answer": "laptop"},
                {"id": "F24", "sentence": "This app help me learn English.", "wrongWord": "help", "answer": "helps"},
                {"id": "F25", "sentence": "I've got three useful glues on my laptop.", "wrongWord": "glues", "answer": "apps"},
                {"id": "F26", "sentence": "We can find information in the Internet.", "wrongWord": "in", "answer": "on"},
                {"id": "F27", "sentence": "This laptop can connect to hifi.", "wrongWord": "hifi", "answer": "wifi"},
                {"id": "F28", "sentence": "The words appear in the screen.", "wrongWord": "in", "answer": "on"},
                {"id": "F29", "sentence": "This website have lots of information about animals.", "wrongWord": "have", "answer": "has"},
                {"id": "F30", "sentence": "I use an online bin to check new words.", "wrongWord": "bin", "answer": "dictionary"},
                {"id": "F31", "sentence": "My rucksack have two big pockets.", "wrongWord": "have", "answer": "has"},
                {"id": "F32", "sentence": "You can reads an e-book on your laptop.", "wrongWord": "reads", "answer": "read"},
                {"id": "F33", "sentence": "Use scissors to cutting the paper.", "wrongWord": "cutting", "answer": "cut"},
                {"id": "F34", "sentence": "You should past the copied text into your project.", "wrongWord": "past", "answer": "paste"}
            ]
        }
    };
    const unit7Catalogs = {
        83: {
            missing: [
                {"id": "M1", "sentences": ["He prepares food in a restaurant kitchen. He's a ___.", "She brings meals to the customers' tables. She's a ___."], "answers": ["cook", "waiter"], "prefixes": ["c", "w"]},
                {"id": "M2", "sentences": ["He drives a bus. He's a ___.", "Her job is taking wedding photos. She's a ___."], "answers": ["driver", "photographer"], "prefixes": ["d", "p"]},
                {"id": "M3", "sentences": ["He paints pictures. He's an ___.", "She creates new clothes. She's a ___."], "answers": ["artist", "designer"], "prefixes": ["a", "d"]},
                {"id": "M4", "sentences": ["He writes news stories. He's a ___.", "She sings at concerts. She's a ___."], "answers": ["journalist", "singer"], "prefixes": ["j", "s"]},
                {"id": "M5", "sentences": ["He's an ___ in a film.", "She wants to be ___ artist."], "answers": ["actor", "an"], "prefixes": ["a", ""]}
            ],
            fix: [
                {"id": "F1", "sentence": "A waiter cooks the food in a restaurant kitchen.", "wrongWord": "waiter", "answer": "cook"},
                {"id": "F2", "sentence": "A cook brings meals to the customers' tables.", "wrongWord": "cook", "answer": "waiter"},
                {"id": "F3", "sentence": "A singer drives a bus.", "wrongWord": "singer", "answer": "driver"},
                {"id": "F4", "sentence": "His job is taking wedding photos. He's a driver.", "wrongWord": "driver", "answer": "photographer"},
                {"id": "F5", "sentence": "His job is designing clothes. He's a cook.", "wrongWord": "cook", "answer": "designer"},
                {"id": "F6", "sentence": "Her job is writing news stories. She's a waiter.", "wrongWord": "waiter", "answer": "journalist"},
                {"id": "F7", "sentence": "He's an artist who performs different characters in films.", "wrongWord": "artist", "answer": "actor"},
                {"id": "F8", "sentence": "She's a driver who sings on stage for her job.", "wrongWord": "driver", "answer": "singer"},
                {"id": "F9", "sentence": "Her job is painting pictures. She's an actor.", "wrongWord": "actor", "answer": "artist"},
                {"id": "F10", "sentence": "She wants to be a artist.", "wrongWord": "a", "answer": "an"}
            ]
        },
        85: {
            missing: [
                {"id": "M6", "sentences": ["When she ___ up, she wants to be a journalist.", "When they ___ up, they want to be artists."], "answers": ["grows", "grow"], "prefixes": ["g", "g"]},
                {"id": "M7", "sentences": ["If he ___ the competition, he gets a prize.", "If they ___ the competition, they get a prize."], "answers": ["wins", "win"], "prefixes": ["w", "w"]},
                {"id": "M8", "sentences": ["If I ___ eat breakfast, I'm hungry at ten.", "If she ___ eat breakfast, she's hungry at ten."], "answers": ["don't", "doesn't"]},
                {"id": "M9", "sentences": ["When the teacher ___ speaking, we listen.", "When the teachers ___ speaking, we listen."], "answers": ["is", "are"]},
                {"id": "M10", "sentences": ["If she ___ her homework early, she can play.", "If we ___ our homework early, we can play."], "answers": ["finishes", "finish"], "prefixes": ["f", "f"]},
                {"id": "M11", "sentences": ["If you want ___ be a cook, practise cooking.", "When she grows ___, she wants to be a journalist."], "answers": ["to", "up"]},
                {"id": "M23", "sentences": ["I might win the competition. ___ I win, I get a prize.", "I want to be a photographer ___ I grow up."], "answers": ["if", "when"]},
                {"id": "M24", "sentences": ["Our lesson finishes at four. ___ it finishes, we go home.", "I might need help. ___ I do, I ask my teacher."], "answers": ["when", "if"]},
                {"id": "M25", "sentences": ["Maybe we can buy tickets online. ___ we can, we don't need to queue.", "The show starts at seven tonight. ___ it starts, we stop talking."], "answers": ["if", "when"]},
                {"id": "M26", "sentences": ["My birthday is tomorrow. ___ I wake up, I can open my presents.", "I'm not sure I can finish today. ___ I finish, I can play outside."], "answers": ["when", "if"]}
            ],
            fix: [
                {"id": "F11", "sentence": "When she grow up, she wants to be a journalist.", "wrongWord": "grow", "answer": "grows"},
                {"id": "F12", "sentence": "If he win the competition, he gets a prize.", "wrongWord": "win", "answer": "wins"},
                {"id": "F13", "sentence": "If she don't eat breakfast, she feels hungry.", "wrongWord": "don't", "answer": "doesn't"},
                {"id": "F14", "sentence": "When the teacher are speaking, we listen.", "wrongWord": "are", "answer": "is"},
                {"id": "F15", "sentence": "If you wants to be a cook, practise cooking.", "wrongWord": "wants", "answer": "want"},
                {"id": "F16", "sentence": "When they finishes work, they go home.", "wrongWord": "finishes", "answer": "finish"},
                {"id": "F17", "sentence": "If I haven't got a pen, I asks a friend for one.", "wrongWord": "asks", "answer": "ask"},
                {"id": "F18", "sentence": "If the restaurant has a good cook, people eats there.", "wrongWord": "eats", "answer": "eat"},
                {"id": "F29", "sentence": "I might win the competition, but I might not. When I win, I get a prize.", "wrongWord": "when", "answer": "if"},
                {"id": "F30", "sentence": "Our lesson finishes at four. If it finishes, we go home.", "wrongWord": "if", "answer": "when"},
                {"id": "F31", "sentence": "I want to be a photographer if I grow up.", "wrongWord": "if", "answer": "when"},
                {"id": "F32", "sentence": "I'm not sure I can finish today. When I finish today, I can play outside.", "wrongWord": "when", "answer": "if"}
            ]
        },
        87: {
            missing: [
                {"id": "M12", "sentences": ["He helps his neighbours. He's ___.", "She laughs at people when they need help. She's ___."], "answers": ["kind", "unkind"], "prefixes": ["k", "u"]},
                {"id": "M13", "sentences": ["She smiles and says hello to everyone. She's ___.", "He won't speak to new people or say hello. He's ___."], "answers": ["friendly", "unfriendly"], "prefixes": ["f", "u"]},
                {"id": "M14", "sentences": ["She learns quickly and solves difficult problems. She's ___.", "He never wants to work. He's ___."], "answers": ["clever", "lazy"], "prefixes": ["c", "l"]},
                {"id": "M15", "sentences": ["She helps people even when it's dangerous. She's ___.", "Everyone wants to be his friend. He's ___."], "answers": ["brave", "popular"], "prefixes": ["b", "p"]},
                {"id": "M16", "sentences": ["His lessons are never boring. They're ___.", "His jokes make us laugh. He's ___."], "answers": ["interesting", "funny"], "prefixes": ["i", "f"]},
                {"id": "M17", "sentences": ["This puppy is beautiful and sweet. It's ___.", "This film makes me want to sleep. It's ___."], "answers": ["lovely", "boring"], "prefixes": ["l", "b"]},
                {"id": "M18", "sentences": ["What ___ your uncle like? He's kind.", "What ___ your uncle look like? He's tall."], "answers": ["is", "does"]},
                {"id": "M19", "sentences": ["What ___ your parents like? They're friendly.", "What ___ your parents look like? They've got dark hair."], "answers": ["are", "do"]},
                {"id": "M20", "sentences": ["What does she ___ like? She's tall and thin.", "What is she ___? She's brave."], "answers": ["look", "like"]},
                {"id": "M21", "sentences": ["He ___ like his dad. They've both got curly hair.", "They ___ like their mum. They've all got blue eyes."], "answers": ["looks", "look"], "prefixes": ["l", "l"]},
                {"id": "M22", "sentences": ["My sister ___ got long brown hair.", "My brothers ___ got short black hair."], "answers": ["has", "have"]}
            ],
            fix: [
                {"id": "F19", "sentence": "He always helps people. He's unkind.", "wrongWord": "unkind", "answer": "kind"},
                {"id": "F20", "sentence": "She smiles and says hello to everyone. She's unfriendly.", "wrongWord": "unfriendly", "answer": "friendly"},
                {"id": "F21", "sentence": "He never wants to work. He's brave.", "wrongWord": "brave", "answer": "lazy"},
                {"id": "F22", "sentence": "He helps people even when it's dangerous. He's lazy.", "wrongWord": "lazy", "answer": "brave"},
                {"id": "F23", "sentence": "Everyone wants to be her friend. She's unpopular.", "wrongWord": "unpopular", "answer": "popular"},
                {"id": "F24", "sentence": "What does your uncle like? He's kind and friendly.", "wrongWord": "does", "answer": "is"},
                {"id": "F25", "sentence": "What is your brother look like? He's tall.", "wrongWord": "is", "answer": "does"},
                {"id": "F26", "sentence": "What does your parents look like? They've got grey hair.", "wrongWord": "does", "answer": "do"},
                {"id": "F27", "sentence": "What is your parents like? They're kind.", "wrongWord": "is", "answer": "are"},
                {"id": "F28", "sentence": "He look like his dad. They've both got curly hair.", "wrongWord": "look", "answer": "looks"}
            ]
        }
    };
    const unit8Catalogs = {
        95: {
            missing: [
                {"id": "M1", "sentences": ["On a compass, N means ___.", "On a compass, S means ___."], "answers": ["north", "south"], "prefixes": ["n", "s"]},
                {"id": "M2", "sentences": ["The sun rises in the ___.", "The sun sets in the ___."], "answers": ["east", "west"], "prefixes": ["e", "w"]},
                {"id": "M3", "sentences": ["Don't turn left or right. Go ___ on.", "The opposite of left is ___."], "answers": ["straight", "right"], "prefixes": ["s", "r"]},
                {"id": "M4", "sentences": ["In China, people drive on the ___ side of the road.", "In the UK, people drive on the ___ side."], "answers": ["right", "left"], "prefixes": ["r", "l"]}
            ],
            fix: [
                {"id": "F1", "sentence": "On a compass, N means south.", "wrongWord": "south", "answer": "north"},
                {"id": "F2", "sentence": "The sun rises in the west.", "wrongWord": "west", "answer": "east"},
                {"id": "F3", "sentence": "The opposite of left is straight.", "wrongWord": "straight", "answer": "right"},
                {"id": "F4", "sentence": "In China, people drive on the left side of the road.", "wrongWord": "left", "answer": "right"}
            ]
        },
        97: {
            missing: [
                {"id": "M5", "sentences": ["I___ going to visit a museum tomorrow.", "She___ going to come with me."], "answers": ["'m", "'s"]},
                {"id": "M6", "sentences": ["We___ going to have a picnic.", "It___ going to be sunny."], "answers": ["'re", "'s"]},
                {"id": "M7", "sentences": ["We're ___ to visit a museum.", "She's going ___ take the bus."], "answers": ["going", "to"]},
                {"id": "M8", "sentences": ["___ she going to visit the museum?", "___ they going to come too?"], "answers": ["is", "are"]},
                {"id": "M9", "sentences": ["She's going to ___ a museum tomorrow.", "We're going to ___ a play at the theatre."], "answers": ["visit", "watch"], "prefixes": ["v", "w"]},
                {"id": "M11", "sentences": ["I'm staying at home. I'm ___ going to the park.", "She's staying at home too. She ___ going to the park."], "answers": ["not", "isn't"]},
                {"id": "M12", "sentences": ["I ___ the museum yesterday.", "I'm going to ___ it again tomorrow."], "answers": ["visited", "visit"], "prefixes": ["v", "v"]},
                {"id": "M13", "sentences": ["We ___ football yesterday.", "We're going to ___ again tomorrow."], "answers": ["played", "play"], "prefixes": ["p", "p"]}
            ],
            fix: [
                {"id": "F5", "sentence": "I is going to visit a museum tomorrow.", "wrongWord": "is", "answer": "am"},
                {"id": "F6", "sentence": "She are going to catch the bus.", "wrongWord": "are", "answer": "is"},
                {"id": "F7", "sentence": "They is going to play football.", "wrongWord": "is", "answer": "are"},
                {"id": "F8", "sentence": "We're go to have lunch in the park.", "wrongWord": "go", "answer": "going"},
                {"id": "F9", "sentence": "He's going for take his umbrella.", "wrongWord": "for", "answer": "to"},
                {"id": "F10", "sentence": "She's going to visiting a museum.", "wrongWord": "visiting", "answer": "visit"},
                {"id": "F11", "sentence": "What is they going to do tomorrow?", "wrongWord": "is", "answer": "are"},
                {"id": "F12", "sentence": "Are he going to take the bus?", "wrongWord": "are", "answer": "is"},
                {"id": "F13", "sentence": "They don't going to swim today.", "wrongWord": "don't", "answer": "aren't"},
                {"id": "F14", "sentence": "I'm going to took my umbrella.", "wrongWord": "took", "answer": "take"}
            ]
        },
        98: {
            missing: [
                {"id": "M14", "sentences": ["We catch a plane at the ___.", "We book a room at a ___."], "answers": ["airport", "hotel"], "prefixes": ["a", "h"]},
                {"id": "M15", "sentences": ["We go to the ___", "to get ___."], "answers": ["bank", "money"], "prefixes": ["b", "m"]},
                {"id": "M16", "sentences": ["We buy ___ at the ___ ___."], "answers": ["stamps", "post", "office"], "prefixes": ["s", "p", "o"]},
                {"id": "M17", "sentences": ["We buy medicine at the ___.", "We watch plays at the ___."], "answers": ["chemist's", "theatre"], "prefixes": ["c", "t"]},
                {"id": "M18", "sentences": ["We can see old objects at a ___.", "My brother studies engineering at ___."], "answers": ["museum", "university"], "prefixes": ["m", "u"]},
                {"id": "M19", "sentences": ["We pay for meals at a ___.", "Houses, schools and hotels are ___."], "answers": ["restaurant", "buildings"], "prefixes": ["r", "b"]}
            ],
            fix: [
                {"id": "F15", "sentence": "We catch our plane at the museum.", "wrongWord": "museum", "answer": "airport"},
                {"id": "F16", "sentence": "We get money from the theatre.", "wrongWord": "theatre", "answer": "bank"},
                {"id": "F17", "sentence": "We buy stamps at the post museum.", "wrongWord": "museum", "answer": "office"},
                {"id": "F18", "sentence": "We buy medicine at the bank.", "wrongWord": "bank", "answer": "chemist's"},
                {"id": "F19", "sentence": "We watch plays at the airport.", "wrongWord": "airport", "answer": "theatre"},
                {"id": "F20", "sentence": "We can see ancient objects in a restaurant.", "wrongWord": "restaurant", "answer": "museum"},
                {"id": "F21", "sentence": "My brother studies engineering at a hotel.", "wrongWord": "hotel", "answer": "university"},
                {"id": "F22", "sentence": "We booked a room at a bank for our holiday.", "wrongWord": "bank", "answer": "hotel"},
                {"id": "F23", "sentence": "We paid for our meal at the museum.", "wrongWord": "museum", "answer": "restaurant"},
                {"id": "F24", "sentence": "We put money on letters before we post them.", "wrongWord": "money", "answer": "stamps"}
            ]
        },
        99: {
            missing: [
                {"id": "M20", "sentences": ["He opened the door and went ___ the house.", "She left the car. She got ___ ___ it."], "answers": ["into", "out", "of"], "prefixes": ["i", "o", "o"]},
                {"id": "M21", "sentences": ["We drove ___ the tunnel.", "The bird flew ___ the roof."], "answers": ["through", "over"], "prefixes": ["t", "o"]},
                {"id": "M22", "sentences": ["Walk ___ the bridge to the other side.", "We didn't enter the bank. We walked ___ it."], "answers": ["across", "past"], "prefixes": ["a", "p"]},
                {"id": "M23", "sentences": ["Don't go through the flower bed. Walk ___ it.", "Go into the park ___ the gate."], "answers": ["round", "through"], "prefixes": ["r", "t"]},
                {"id": "M24", "sentences": ["She got out ___ the car.", "We're going ___ the hotel."], "answers": ["of", "to"]}
            ],
            fix: [
                {"id": "F25", "sentence": "Inside the tunnel, we drove over the mountain.", "wrongWord": "over", "answer": "through"},
                {"id": "F26", "sentence": "We didn't enter the bank. We walked into it and kept going.", "wrongWord": "into", "answer": "past"},
                {"id": "F27", "sentence": "She left the car. She got out to it.", "wrongWord": "to", "answer": "of"},
                {"id": "F28", "sentence": "We opened the door and walked onto the room.", "wrongWord": "onto", "answer": "into"},
                {"id": "F29", "sentence": "He used the bridge to walk through the river.", "wrongWord": "through", "answer": "across"},
                {"id": "F30", "sentence": "The bird flew through the house, high above its roof.", "wrongWord": "through", "answer": "over"},
                {"id": "F31", "sentence": "Keep outside the flower bed. Walk through it.", "wrongWord": "through", "answer": "round"},
                {"id": "F32", "sentence": "She got into of the car and walked away.", "wrongWord": "into", "answer": "out"}
            ]
        }
    };
    // Approved Unit 9 additions; page 109 retains its original catalog above.
    const unit9Catalogs = {
        "107": {
            missing: [
                {"id": "M1", "sentences": ["It's a ___ elephant.", "It's a ___ mouse."], "answers": ["huge", "little"], "prefixes": ["h", "l"]},
                {"id": "M2", "sentences": ["Everyone is shouting. The room is ___.", "Everyone is whispering. The room is ___."], "answers": ["noisy", "quiet"], "prefixes": ["n", "q"]},
                {"id": "M3", "sentences": ["There's poopoo in my soup. It tastes ___.", "This food tastes very good. It's ___."], "answers": ["horrible", "excellent"], "prefixes": ["h", "e"]},
                {"id": "M4", "sentences": ["I won the prize! I'm so ___.", "Nobody is with him. He's ___."], "answers": ["lucky", "alone"], "prefixes": ["l", "a"]},
                {"id": "M5", "sentences": ["Chinese New Year is a ___ day, when we eat ___ food."], "answers": ["special", "excellent"], "prefixes": ["s", "e"]},
                {"id": "M6", "sentences": ["\"Enormous\" means the same as ___.", "\"___\" means the same as fantastic."], "answers": ["huge", "brilliant"], "prefixes": ["h", "b"]},
                {"id": "M7", "sentences": ["The test isn't easy. It's ___.", "The teacher was happy with my work. She was ___."], "answers": ["difficult", "pleased"], "prefixes": ["d", "p"]},
                {"id": "M8", "sentences": ["There isn't any light. The room is ___.", "This animal looks very unusual. It's ___."], "answers": ["dark", "strange"], "prefixes": ["d", "s"]}
            ],
            fix: [
                {"id": "F1", "sentence": "This elephant is enormous. It's little.", "wrongWord": "little", "answer": "huge"},
                {"id": "F2", "sentence": "This mouse is very small. It's huge.", "wrongWord": "huge", "answer": "little"},
                {"id": "F3", "sentence": "Everyone is shouting. The room is quiet.", "wrongWord": "quiet", "answer": "noisy"},
                {"id": "F4", "sentence": "Nobody is with me. I'm together.", "wrongWord": "together", "answer": "alone"},
                {"id": "F5", "sentence": "This poopoo soup tastes amazing.", "wrongWord": "amazing", "answer": "horrible"},
                {"id": "F6", "sentence": "My birthday's a normal day for me!", "wrongWord": "normal", "answer": "special"},
                {"id": "F7", "sentence": "\"Enormous\" means small.", "wrongWord": "small", "answer": "huge"},
                {"id": "F8", "sentence": "\"Fantastic\" means terrible.", "wrongWord": "terrible", "answer": "brilliant"},
                {"id": "F9", "sentence": "The test was very hard. It was easy.", "wrongWord": "easy", "answer": "difficult"},
                {"id": "F10", "sentence": "The teacher was happy with my work. She was sad.", "wrongWord": "sad", "answer": "pleased"}
            ]
        },
        "110": {
            missing: [
                {"id": "M1", "sentences": ["I put on my ___ before going to bed.", "I wear ___ on my feet when I play tennis."], "answers": ["pyjamas", "trainers"], "prefixes": ["p", "t"]},
                {"id": "M2", "sentences": ["We sleep in a ___ when we go camping.", "We build ___ with sand on the beach."], "answers": ["tent", "sandcastles"], "prefixes": ["t", "s"]},
                {"id": "M3", "sentences": ["I put my clothes in a ___ before going on a trip.", "I carry my ___ on my back."], "answers": ["suitcase", "rucksack"], "prefixes": ["s", "r"]},
                {"id": "M4", "sentences": ["We sent a ___ to Grandma from our holiday.", "We put a ___ on it before posting it."], "answers": ["postcard", "stamp"], "prefixes": ["p", "s"]},
                {"id": "M5", "sentences": ["The ___ from the top of the hill was beautiful.", "The circus is travelling from city to city on a ___."], "answers": ["view", "tour"], "prefixes": ["v", "t"]},
                {"id": "M6", "sentences": ["I'm going to ___ my suitcase tonight.", "We're going on ___ tomorrow."], "answers": ["pack", "holiday"], "prefixes": ["p", "h"]},
                {"id": "M7", "sentences": ["I'll put on my ___.", "Let's make a sandcastle on the ___."], "answers": ["sunglasses", "beach"], "prefixes": ["s", "b"]},
                {"id": "M8", "sentences": ["Don't ___ to pack your trainers.", "Please ___ to put a stamp on the postcard."], "answers": ["forget", "remember"], "prefixes": ["f", "r"]}
            ],
            fix: [
                {"id": "F1", "sentence": "I wear my trainers in bed.", "wrongWord": "trainers", "answer": "pyjamas"},
                {"id": "F2", "sentence": "I put on my pyjamas before I play football.", "wrongWord": "pyjamas", "answer": "trainers"},
                {"id": "F3", "sentence": "We sleep in a stamp when we go camping.", "wrongWord": "stamp", "answer": "tent"},
                {"id": "F4", "sentence": "We use sand to make postcards on the beach.", "wrongWord": "postcards", "answer": "sandcastles"},
                {"id": "F5", "sentence": "My suitcase has shoulder straps. I carry it on my back.", "wrongWord": "suitcase", "answer": "rucksack"},
                {"id": "F6", "sentence": "I pack my holiday clothes in my postcard.", "wrongWord": "postcard", "answer": "suitcase"},
                {"id": "F7", "sentence": "Don't forget to put a tent on the postcard before you send it.", "wrongWord": "tent", "answer": "stamp"},
                {"id": "F8", "sentence": "This suitcase is a card with a holiday picture and a short message.", "wrongWord": "suitcase", "answer": "postcard"},
                {"id": "F9", "sentence": "We climbed the hill to enjoy the stamp of the sea.", "wrongWord": "stamp", "answer": "view"},
                {"id": "F10", "sentence": "The tour has finished. It's under.", "wrongWord": "under", "answer": "over"},
                {"id": "F11", "sentence": "Please forget to put a stamp on the postcard before you post it.", "wrongWord": "forget", "answer": "remember"},
                {"id": "F12", "sentence": "I need to make my suitcase before we leave for our holiday.", "wrongWord": "make", "answer": "pack"}
            ]
        },
        "111": {
            missing: [
                {"id": "M1", "sentences": ["The lesson was ___.", "I felt ___ during the lesson."], "answers": ["boring", "bored"], "prefixes": ["b", "b"]},
                {"id": "M2", "sentences": ["I'm ___ about our holiday.", "Our holiday plans sound ___."], "answers": ["excited", "exciting"], "prefixes": ["e", "e"]},
                {"id": "M3", "sentences": ["The huge dog looked ___.", "The little girl felt ___."], "answers": ["frightening", "frightened"], "prefixes": ["f", "f"]},
                {"id": "M4", "sentences": ["I'm ___ in dinosaurs.", "This dinosaur book is ___."], "answers": ["interested", "interesting"], "prefixes": ["i", "i"]},
                {"id": "M5", "sentences": ["The unexpected present was ___.", "I was ___ when I opened it."], "answers": ["surprising", "surprised"], "prefixes": ["s", "s"]},
                {"id": "M6", "sentences": ["We felt ___ after the walk.", "The long walk was ___."], "answers": ["tired", "tiring"], "prefixes": ["t", "t"]},
                {"id": "M7", "sentences": ["The news about the storm was ___.", "Dad felt ___ about our boat trip."], "answers": ["worrying", "worried"], "prefixes": ["w", "w"]},
                {"id": "M8", "sentences": ["I wasn't ___ of the dog because it was friendly.", "The huge shark in the film looked ___."], "answers": ["frightened", "frightening"], "prefixes": ["f", "f"]}
            ],
            fix: [
                {"id": "F1", "sentence": "The lesson was bored.", "wrongWord": "bored", "answer": "boring"},
                {"id": "F2", "sentence": "The lesson made me feel boring.", "wrongWord": "boring", "answer": "bored"},
                {"id": "F3", "sentence": "We're exciting about our holiday.", "wrongWord": "exciting", "answer": "excited"},
                {"id": "F4", "sentence": "The roller coaster was excited.", "wrongWord": "excited", "answer": "exciting"},
                {"id": "F5", "sentence": "The dog's loud barking was frightened.", "wrongWord": "frightened", "answer": "frightening"},
                {"id": "F6", "sentence": "She was frightening of the dog.", "wrongWord": "frightening", "answer": "frightened"},
                {"id": "F7", "sentence": "I'm interesting in dinosaurs.", "wrongWord": "interesting", "answer": "interested"},
                {"id": "F8", "sentence": "This book about dinosaurs is interested.", "wrongWord": "interested", "answer": "interesting"},
                {"id": "F9", "sentence": "I was surprising by the unexpected present.", "wrongWord": "surprising", "answer": "surprised"},
                {"id": "F10", "sentence": "The unexpected present was surprised.", "wrongWord": "surprised", "answer": "surprising"},
                {"id": "F11", "sentence": "The long walk made us feel tiring.", "wrongWord": "tiring", "answer": "tired"},
                {"id": "F12", "sentence": "The long walk was tired.", "wrongWord": "tired", "answer": "tiring"},
                {"id": "F13", "sentence": "The exam made me feel worrying.", "wrongWord": "worrying", "answer": "worried"},
                {"id": "F14", "sentence": "The news about the storm was worried.", "wrongWord": "worried", "answer": "worrying"}
            ]
        }
    };

    // PU2 Unit 1: teacher-approved boards, grouped by the existing app pages.
    const pu2Unit1Catalogs = {
        7: {
            missing: [
                {"id": "M1", "sentences": ["The cows are eating grass in the ___.", "There are lots of trees in the ___."], "answers": ["field", "forest"], "prefixes": ["f", "f"]},
                {"id": "M2", "sentences": ["Jane is fishing in the ___.", "There's a boat on the ___."], "answers": ["river", "lake"], "prefixes": ["r", "l"]},
                {"id": "M3", "sentences": ["Grandpa is driving his ___ on the farm.", "We're climbing a very high ___."], "answers": ["tractor", "mountain"], "prefixes": ["t", "m"]},
                {"id": "M4", "sentences": ["There's one red ___ on the tree.", "There are lots of brown ___ under it."], "answers": ["leaf", "leaves"], "prefixes": ["l", "l"]},
                {"id": "M5", "sentences": ["The cows are eating the green ___.", "The dog is digging a hole in the ___."], "answers": ["grass", "ground"], "prefixes": ["g", "g"]}
            ],
            fix: [
                {"id": "F1", "sentence": "Grandpa is driving his boat across the field.", "wrongWord": "boat", "answer": "tractor"},
                {"id": "F2", "sentence": "A forest is a place with lots of cars.", "wrongWord": "cars", "answer": "trees"},
                {"id": "F3", "sentence": "The cows are eating rocks in the field.", "wrongWord": "rocks", "answer": "grass"},
                {"id": "F4", "sentence": "A river is a very high place. You can climb it.", "wrongWord": "river", "answer": "mountain"},
                {"id": "F5", "sentence": "There are lots of leaf under the tree.", "wrongWord": "leaf", "answer": "leaves"}
            ]
        },
        9: {
            missing: [
                {"id": "M6", "sentences": ["A baby cat is a ___.", "A baby dog is a ___."], "answers": ["kitten", "puppy"], "prefixes": ["k", "p"]},
                {"id": "M7", "sentences": ["The kitten ___ sleeping now.", "The puppies ___ playing with a ball."], "answers": ["is", "are"]},
                {"id": "M8", "sentences": ["I ___ doing my homework now.", "We ___ cleaning our shoes."], "answers": ["am", "are"]},
                {"id": "M9", "sentences": ["___ she reading a book?", "___ the children playing outside?"], "answers": ["is", "are"]},
                {"id": "M10", "sentences": ["Mum is ___ a photo.", "Grandpa is ___ his tractor."], "answers": ["taking", "driving"], "prefixes": ["t", "d"]},
                {"id": "M11", "sentences": ["It's cold outside. I'm putting ___ my coat.", "I'm going to bed. I'm taking ___ my shoes."], "answers": ["on", "off"]}
            ],
            fix: [
                {"id": "F6", "sentence": "Mum are taking a photo now.", "wrongWord": "are", "answer": "is"},
                {"id": "F7", "sentence": "The children is playing outside.", "wrongWord": "is", "answer": "are"},
                {"id": "F8", "sentence": "I'm wash my hands now.", "wrongWord": "wash", "answer": "washing"},
                {"id": "F9", "sentence": "Grandpa is drive his tractor.", "wrongWord": "drive", "answer": "driving"},
                {"id": "F10", "sentence": "We're take off our boots.", "wrongWord": "take", "answer": "taking"},
                {"id": "F11", "sentence": "The puppy is play with a ball.", "wrongWord": "play", "answer": "playing"},
                {"id": "F12", "sentence": "Are she reading a book?", "wrongWord": "are", "answer": "is"}
            ]
        },
        10: {
            missing: [
                {"id": "M12", "sentences": ["I put ___ on my toothbrush.", "Then I clean my ___."], "answers": ["toothpaste", "teeth"], "prefixes": ["t", "t"]},
                {"id": "M13", "sentences": ["After my shower, I use a ___ to get dry.", "Then I get my school clothes and I get ___."], "answers": ["towel", "dressed"], "prefixes": ["t", "d"]},
                {"id": "M14", "sentences": ["My brother ___ up at seven every morning.", "He ___ breakfast at eight."], "answers": ["gets", "has"], "prefixes": ["g", "h"]},
                {"id": "M15", "sentences": ["My mum ___ up at seven every morning.", "My sister ___ her hands before lunch."], "answers": ["wakes", "washes"], "prefixes": ["w", "w"]},
                {"id": "M16", "sentences": ["What time ___ you get up?", "What time ___ your sister get up?"], "answers": ["do", "does"]},
                {"id": "M17", "sentences": ["___ your parents have breakfast at home?", "___ your brother have lunch at school?"], "answers": ["do", "does"]},
                {"id": "M18", "sentences": ["I get up ___ seven o'clock.", "I have a shower ___ the evening."], "answers": ["at", "in"]}
            ],
            fix: [
                {"id": "F13", "sentence": "My dad have a shower every evening.", "wrongWord": "have", "answer": "has"},
                {"id": "F14", "sentence": "I gets dressed every morning.", "wrongWord": "gets", "answer": "get"},
                {"id": "F15", "sentence": "My mum wake up at seven every day.", "wrongWord": "wake", "answer": "wakes"},
                {"id": "F16", "sentence": "My sister wash her hands before lunch every day.", "wrongWord": "wash", "answer": "washes"},
                {"id": "F17", "sentence": "What time do your brother get up?", "wrongWord": "do", "answer": "does"},
                {"id": "F18", "sentence": "Does your sister has breakfast at home?", "wrongWord": "has", "answer": "have"},
                {"id": "F19", "sentence": "I get up in seven o'clock.", "wrongWord": "in", "answer": "at"},
                {"id": "F20", "sentence": "I put a towel on my toothbrush to clean my teeth.", "wrongWord": "towel", "answer": "toothpaste"}
            ]
        },
        16: {
            missing: [
                {"id": "M19", "sentences": ["I ___ breakfast at eight every day.", "Now I'm ___ a shower."], "answers": ["have", "having"], "prefixes": ["h", "h"]},
                {"id": "M20", "sentences": ["She ___ her face every morning.", "Now she's ___ her hands."], "answers": ["washes", "washing"], "prefixes": ["w", "w"]},
                {"id": "M21", "sentences": ["They ___ in the field every day.", "Now they're ___ in the forest."], "answers": ["play", "playing"], "prefixes": ["p", "p"]},
                {"id": "M22", "sentences": ["What time ___ he get up every day?", "What ___ he doing now?"], "answers": ["does", "is"]}
            ],
            fix: [
                {"id": "F21", "sentence": "Every morning, he getting up at seven.", "wrongWord": "getting", "answer": "gets"},
                {"id": "F22", "sentence": "Mum has a shower every morning. Now she's have breakfast.", "wrongWord": "have", "answer": "having"},
                {"id": "F23", "sentence": "The children walk to school every day. Today they're ride their bikes.", "wrongWord": "ride", "answer": "riding"},
                {"id": "F24", "sentence": "Every evening, they cleaning their teeth before bed.", "wrongWord": "cleaning", "answer": "clean"}
            ]
        }
    };

    // PU2 Unit 2: approved wording and locked initials.
    const pu2Unit2Catalogs = {
        19: {
            missing: [
                {"id": "M1", "sentences": ["Sunday comes after ___.", "Sunday comes before ___."], "answers": ["saturday", "monday"]},
                {"id": "M2", "sentences": ["___ comes between Tuesday and Thursday.", "___ comes between Wednesday and Friday."], "answers": ["wednesday", "thursday"]},
                {"id": "M3", "sentences": ["Thursday comes before ___.", "Wednesday comes after ___."], "answers": ["friday", "tuesday"]},
                {"id": "M4", "sentences": ["Saturday comes before ___.", "Saturday and Sunday are the ___."], "answers": ["sunday", "weekend"]},
                {"id": "M5", "sentences": ["Monday comes ___ Tuesday.", "Tuesday comes ___ Monday."], "answers": ["before", "after"]},
                {"id": "M6", "sentences": ["Wednesday comes ___ Tuesday and Thursday.", "Friday comes ___ Saturday."], "answers": ["between", "before"]}
            ],
            fix: [
                {"id": "F1", "sentence": "Tuesday comes before Monday.", "wrongWord": "before", "answer": "after"},
                {"id": "F2", "sentence": "Wednesday comes after Thursday.", "wrongWord": "after", "answer": "before"},
                {"id": "F3", "sentence": "Friday comes between Tuesday and Thursday.", "wrongWord": "friday", "answer": "wednesday"},
                {"id": "F4", "sentence": "Saturday and Sunday are the weekday.", "wrongWord": "weekday", "answer": "weekend"},
                {"id": "F5", "sentence": "We go to school at Mondays.", "wrongWord": "at", "answer": "on"},
                {"id": "F6", "sentence": "The day before Sunday is Friday.", "wrongWord": "friday", "answer": "saturday"},
                {"id": "F7", "sentence": "There are seven days in a weekend.", "wrongWord": "weekend", "answer": "week"}
            ]
        },
        21: {
            missing: [
                {"id": "M7", "sentences": ["I clean my teeth every morning. I ___ clean them in the morning.", "I don't eat fish at all. I ___ eat fish."], "answers": ["always", "never"], "prefixes": ["a", "n"]},
                {"id": "M8", "sentences": ["I play tennis most weekends. I ___ play tennis.", "I play football on some weekends. I ___ play football."], "answers": ["often", "sometimes"], "prefixes": ["o", "s"]},
                {"id": "M9", "sentences": ["How ___ do you swim? Twice a week.", "Do you ___ go skating? Yes, sometimes."], "answers": ["often", "ever"]},
                {"id": "M10", "sentences": ["I swim on Mondays and Thursdays. That's ___ a week.", "I have one English lesson every week. That's ___ a week."], "answers": ["twice", "once"], "prefixes": ["t", "o"]},
                {"id": "M11", "sentences": ["She cleans her teeth every morning and every evening. That's twice a ___.", "He plays football only on Sundays. That's once a ___."], "answers": ["day", "week"], "prefixes": ["d", "w"]},
                {"id": "M12", "sentences": ["How often ___ you read comics?", "How often ___ your sister go swimming?"], "answers": ["do", "does"]}
            ],
            fix: [
                {"id": "F8", "sentence": "I never clean my teeth in the morning. I do it every morning!", "wrongWord": "never", "answer": "always"},
                {"id": "F9", "sentence": "I always eat fish. I don't eat it at all.", "wrongWord": "always", "answer": "never"},
                {"id": "F10", "sentence": "I swim on Mondays and Thursdays. That's once a week.", "wrongWord": "once", "answer": "twice"},
                {"id": "F11", "sentence": "I have one English lesson every week. That's twice a week.", "wrongWord": "twice", "answer": "once"},
                {"id": "F12", "sentence": "How many do you go swimming? Twice a week.", "wrongWord": "many", "answer": "often"},
                {"id": "F13", "sentence": "Does she often plays tennis?", "wrongWord": "plays", "answer": "play"},
                {"id": "F14", "sentence": "Do he ever go skating?", "wrongWord": "do", "answer": "does"}
            ]
        },
        22: {
            missing: [
                {"id": "M13", "sentences": ["I ___ to music in the car.", "I ___ films at the cinema."], "answers": ["listen", "watch"], "prefixes": ["l", "w"]},
                {"id": "M14", "sentences": ["I ___ a comic before bed.", "I ___ an email to Grandma every week."], "answers": ["read", "write"], "prefixes": ["r", "w"]},
                {"id": "M15", "sentences": ["We go ___ to buy food.", "I put on my skates and go ___ in the park."], "answers": ["shopping", "skating"], "prefixes": ["s", "s"]},
                {"id": "M16", "sentences": ["She often ___ to music.", "He sometimes ___ DVDs."], "answers": ["listens", "watches"], "prefixes": ["l", "w"]},
                {"id": "M17", "sentences": ["She doesn't ___ DVDs.", "He doesn't ___ to CDs."], "answers": ["watch", "listen"], "prefixes": ["w", "l"]},
                {"id": "M18", "sentences": ["I listen ___ a CD.", "I write ___ email to my cousin."], "answers": ["to", "an"]}
            ],
            fix: [
                {"id": "F15", "sentence": "I always listen at music in the car.", "wrongWord": "at", "answer": "to"},
                {"id": "F16", "sentence": "She often watch films on Friday evenings.", "wrongWord": "watch", "answer": "watches"},
                {"id": "F17", "sentence": "Every Saturday, Dad write an email to Grandma.", "wrongWord": "write", "answer": "writes"},
                {"id": "F18", "sentence": "I eat an email to Grandma every week.", "wrongWord": "eat", "answer": "write"},
                {"id": "F19", "sentence": "We go swimming at the supermarket to buy food.", "wrongWord": "swimming", "answer": "shopping"},
                {"id": "F20", "sentence": "She doesn't watches DVDs.", "wrongWord": "watches", "answer": "watch"}
            ]
        },
        25: {
            missing: [
                {"id": "M19", "sentences": ["We ___ listen to the teacher.", "We ___ kick our classmates."], "answers": ["must", "mustn't"], "prefixes": ["m", "m"]},
                {"id": "M20", "sentences": ["You ___ skate in the road.", "You ___ wear a helmet when you ride a bike."], "answers": ["mustn't", "must"], "prefixes": ["m", "m"]},
                {"id": "M21", "sentences": ["You must ___ a helmet when you ride a bike.", "You mustn't ___ in the road."], "answers": ["wear", "skate"], "prefixes": ["w", "s"]},
                {"id": "M22", "sentences": ["I wear a ___ to protect my head.", "I wear ___ to protect my hands."], "answers": ["helmet", "gloves"], "prefixes": ["h", "g"]},
                {"id": "M23", "sentences": ["I wear ___ to protect my eyes in the pool.", "I wear ___ ___ to protect my knees when I skate."], "answers": ["goggles", "knee", "pads"], "prefixes": ["g", "k", "p"]},
                {"id": "M24", "sentences": ["My helmet protects my ___.", "My gloves protect my ___."], "answers": ["head", "hands"], "prefixes": ["h", "h"]}
            ],
            fix: [
                {"id": "F21", "sentence": "We mustn't listen to the teacher.", "wrongWord": "mustn't", "answer": "must"},
                {"id": "F22", "sentence": "You must kick your classmates.", "wrongWord": "must", "answer": "mustn't"},
                {"id": "F23", "sentence": "He must wears a helmet when he rides his bike.", "wrongWord": "wears", "answer": "wear"},
                {"id": "F24", "sentence": "You mustn't skating in the road.", "wrongWord": "skating", "answer": "skate"},
                {"id": "F25", "sentence": "I wear goggles to protect my head when I ride my bike.", "wrongWord": "goggles", "answer": "helmet"},
                {"id": "F26", "sentence": "I wear gloves to protect my eyes when I swim.", "wrongWord": "gloves", "answer": "goggles"},
                {"id": "F27", "sentence": "I wear knee pads to protect my hands when I skate.", "wrongWord": "hands", "answer": "knees"},
                {"id": "F28", "sentence": "I wear goggles on my hands to keep them warm.", "wrongWord": "goggles", "answer": "gloves"}
            ]
        }
    };

    // PU2 Unit 3: approved boards, with M16/F22 edits and F5 omitted.
    const pu2Unit3Catalogs = {
        31: {
            missing: [
                {"id": "M1", "sentences": ["A ___ makes food in a restaurant.", "A ___ grows food on a farm."], "answers": ["cook", "farmer"], "prefixes": ["c", "f"]},
                {"id": "M2", "sentences": ["A ___ checks and repairs teeth.", "A ___ helps sick people."], "answers": ["dentist", "doctor"], "prefixes": ["d", "d"]},
                {"id": "M3", "sentences": ["A ___ makes people laugh.", "A ___ helps doctors in a hospital."], "answers": ["clown", "nurse"], "prefixes": ["c", "n"]},
                {"id": "M4", "sentences": ["A ___ ___ acts in films.", "A ___ ___ sings songs."], "answers": ["film", "star", "pop", "star"], "prefixes": ["f", "s", "p", "s"]},
                {"id": "M5", "sentences": ["The ___ is sailing his ship.", "He's looking for ___."], "answers": ["pirate", "treasure"], "prefixes": ["p", "t"]},
                {"id": "M6", "sentences": ["I'm wearing a pirate ___ at the party.", "This birthday ___ is for Grandpa."], "answers": ["costume", "present"], "prefixes": ["c", "p"]}
            ],
            fix: [
                {"id": "F1", "sentence": "A dentist grows food on a farm.", "wrongWord": "dentist", "answer": "farmer"},
                {"id": "F2", "sentence": "A farmer checks your teeth.", "wrongWord": "farmer", "answer": "dentist"},
                {"id": "F3", "sentence": "A clown cooks food in a restaurant.", "wrongWord": "clown", "answer": "cook"},
                {"id": "F4", "sentence": "A pirate makes people laugh at the circus.", "wrongWord": "pirate", "answer": "clown"},
                {"id": "F6", "sentence": "I'm wearing a pirate toothbrush for the party.", "wrongWord": "toothbrush", "answer": "costume"}
            ]
        },
        33: {
            missing: [
                {"id": "M7", "sentences": ["The farmer ___ food every year.", "Now he's ___ carrots."], "answers": ["grows", "growing"], "prefixes": ["g", "g"]},
                {"id": "M8", "sentences": ["The doctor ___ sick people every day.", "Now she's ___ a child."], "answers": ["helps", "helping"], "prefixes": ["h", "h"]},
                {"id": "M9", "sentences": ["He's a cook. He ___ meals every day.", "Now he's ___ dinner."], "answers": ["cooks", "cooking"], "prefixes": ["c", "c"]},
                {"id": "M10", "sentences": ["The pop star ___ songs every day.", "Now she's ___ on stage."], "answers": ["sings", "singing"], "prefixes": ["s", "s"]},
                {"id": "M11", "sentences": ["What ___ she do? She's a farmer.", "What ___ she doing now? She's driving a tractor."], "answers": ["does", "is"]},
                {"id": "M12", "sentences": ["What ___ they do? They're dentists.", "What ___ they doing now? They're helping a child."], "answers": ["do", "are"]},
                {"id": "M13", "sentences": ["He doesn't ___ at the weekend.", "It's Monday. He's ___ now."], "answers": ["work", "working"], "prefixes": ["w", "w"]},
                {"id": "M14", "sentences": ["I don't ___ to the radio every day.", "I'm ___ to it now."], "answers": ["listen", "listening"], "prefixes": ["l", "l"]}
            ],
            fix: [
                {"id": "F7", "sentence": "The farmer grow food every day.", "wrongWord": "grow", "answer": "grows"},
                {"id": "F8", "sentence": "The farmer is grow food now.", "wrongWord": "grow", "answer": "growing"},
                {"id": "F9", "sentence": "The doctor help sick people every day.", "wrongWord": "help", "answer": "helps"},
                {"id": "F10", "sentence": "The doctor is help a child now.", "wrongWord": "help", "answer": "helping"},
                {"id": "F11", "sentence": "The cook make dinner every evening.", "wrongWord": "make", "answer": "makes"},
                {"id": "F12", "sentence": "The cook is make dinner now.", "wrongWord": "make", "answer": "making"},
                {"id": "F13", "sentence": "What does she doing? She's a dentist.", "wrongWord": "doing", "answer": "do"},
                {"id": "F14", "sentence": "What is he do now? He's cooking dinner.", "wrongWord": "do", "answer": "doing"},
                {"id": "F15", "sentence": "She doesn't works at the weekend.", "wrongWord": "works", "answer": "work"},
                {"id": "F16", "sentence": "Are the dentists work now?", "wrongWord": "work", "answer": "working"}
            ]
        },
        40: {
            missing: [
                {"id": "M15", "sentences": ["___ are you happy?", "___ it's my birthday."], "answers": ["why", "because"]},
                {"id": "M16", "sentences": ["___ are you wearing a helmet?", "___ I'm riding my bike."], "answers": ["why", "because"]},
                {"id": "M17", "sentences": ["Why are you ___ your hands? Because I'm going to eat.", "Why are you ___ a book? Because I like stories."], "answers": ["washing", "reading"], "prefixes": ["w", "r"]},
                {"id": "M18", "sentences": ["Why ___ he wearing a helmet? Because he's riding a bike.", "Why ___ they wearing costumes? Because they're going to a party."], "answers": ["is", "are"]},
                {"id": "M19", "sentences": ["Her hair has lots of curls. It's ___.", "His hair has no curls. It's ___."], "answers": ["curly", "straight"], "prefixes": ["c", "s"]},
                {"id": "M20", "sentences": ["He's got a ___ on his chin.", "He's got a ___ under his nose."], "answers": ["beard", "moustache"], "prefixes": ["b", "m"]},
                {"id": "M21", "sentences": ["Her hair is yellow. It's ___.", "He isn't fat. He's ___."], "answers": ["blonde", "thin"], "prefixes": ["b", "t"]},
                {"id": "M22", "sentences": ["Firefighters work at a ___ ___.", "Doctors and nurses work in a ___."], "answers": ["fire", "station", "hospital"], "prefixes": ["f", "s", "h"]},
                {"id": "M23", "sentences": ["A ___ ___ helps keep people safe.", "Police officers work at a police ___."], "answers": ["police", "officer", "station"], "prefixes": ["p", "o", "s"]},
                {"id": "M24", "sentences": ["A teacher works in a ___.", "A ___ helps sick animals."], "answers": ["school", "vet"], "prefixes": ["s", "v"]}
            ],
            fix: [
                {"id": "F17", "sentence": "Where are you wearing a costume? Because I'm going to a party.", "wrongWord": "where", "answer": "why"},
                {"id": "F18", "sentence": "I'm wearing a helmet why I'm riding my bike.", "wrongWord": "why", "answer": "because"},
                {"id": "F19", "sentence": "Why does she wearing a costume?", "wrongWord": "does", "answer": "is"},
                {"id": "F20", "sentence": "Why is the children laughing?", "wrongWord": "is", "answer": "are"},
                {"id": "F21", "sentence": "Her hair has lots of curls. It's straight.", "wrongWord": "straight", "answer": "curly"},
                {"id": "F22", "sentence": "His hair hasn't got any curls. It's curly.", "wrongWord": "curly", "answer": "straight"},
                {"id": "F23", "sentence": "He's got a beard above his mouth, under his nose.", "wrongWord": "beard", "answer": "moustache"},
                {"id": "F24", "sentence": "He's got a moustache on his chin.", "wrongWord": "moustache", "answer": "beard"},
                {"id": "F25", "sentence": "A school is a place where doctors help sick people.", "wrongWord": "school", "answer": "hospital"},
                {"id": "F26", "sentence": "Firefighters work at a police station.", "wrongWord": "police", "answer": "fire"},
                {"id": "F27", "sentence": "Police officers work at a fire station.", "wrongWord": "fire", "answer": "police"},
                {"id": "F28", "sentence": "A dentist helps sick animals at the zoo.", "wrongWord": "dentist", "answer": "vet"}
            ]
        }
    };

    // PU2 Unit 4: approved family, comparative, possession and home boards.
    const pu2Unit4Catalogs = {
        45: {
            missing: [
                {"id": "M1", "sentences": ["My mum's sister is my ___.", "My dad's brother is my ___."], "answers": ["aunt", "uncle"], "prefixes": ["a", "u"]},
                {"id": "M2", "sentences": ["My aunt's daughter is my ___.", "My mum and dad are my ___."], "answers": ["cousin", "parents"], "prefixes": ["c", "p"]},
                {"id": "M3", "sentences": ["My brother is my parents' ___.", "My sister is my parents' ___."], "answers": ["son", "daughter"], "prefixes": ["s", "d"]},
                {"id": "M4", "sentences": ["I'm a boy. I'm my grandparents' ___.", "My sister is their ___."], "answers": ["grandson", "granddaughter"], "prefixes": ["g", "g"]}
            ],
            fix: [
                {"id": "F1", "sentence": "My mum's sister is my uncle.", "wrongWord": "uncle", "answer": "aunt"},
                {"id": "F2", "sentence": "My dad's brother is my aunt.", "wrongWord": "aunt", "answer": "uncle"},
                {"id": "F3", "sentence": "My aunt's daughter is my sister.", "wrongWord": "sister", "answer": "cousin"},
                {"id": "F4", "sentence": "My brother is my parents' daughter.", "wrongWord": "daughter", "answer": "son"},
                {"id": "F5", "sentence": "My sister is my grandparents' grandson.", "wrongWord": "grandson", "answer": "granddaughter"},
                {"id": "F6", "sentence": "My grandma and grandpa are my parents.", "wrongWord": "parents", "answer": "grandparents"}
            ]
        },
        46: {
            missing: [
                {"id": "M5", "sentences": ["I'm ten. My cousin's eight. I'm ___ than my cousin.", "My cousin's ___ than me."], "answers": ["older", "younger"], "prefixes": ["o", "y"]},
                {"id": "M6", "sentences": ["Dad is tall and I'm short. Dad is ___ than me.", "I'm ___ than Dad."], "answers": ["taller", "shorter"], "prefixes": ["t", "s"]},
                {"id": "M7", "sentences": ["An elephant is ___ than a mouse.", "A mouse is ___ than an elephant."], "answers": ["bigger", "smaller"], "prefixes": ["b", "s"]},
                {"id": "M8", "sentences": ["My hair is long. Your hair is short. My hair is ___ than your hair.", "Your hair is ___ than my hair."], "answers": ["longer", "shorter"], "prefixes": ["l", "s"]}
            ],
            fix: [
                {"id": "F7", "sentence": "I'm ten and my cousin's eight. I'm younger than my cousin.", "wrongWord": "younger", "answer": "older"},
                {"id": "F8", "sentence": "Dad is tall and I'm short. Dad is shorter than me.", "wrongWord": "shorter", "answer": "taller"},
                {"id": "F9", "sentence": "An elephant is smaller than a mouse.", "wrongWord": "smaller", "answer": "bigger"},
                {"id": "F10", "sentence": "Your hair is short and mine is long. My hair is shorter than yours.", "wrongWord": "shorter", "answer": "longer"}
            ]
        },
        47: {
            missing: [
                {"id": "M9", "sentences": ["My cat is thin. Your cat is even ___.", "My dog is fat. Your dog is even ___."], "answers": ["thinner", "fatter"], "prefixes": ["t", "f"]},
                {"id": "M10", "sentences": ["I'm happy. My sister is even ___.", "That puppy is naughty. This one is even ___."], "answers": ["happier", "naughtier"], "prefixes": ["h", "n"]},
                {"id": "M11", "sentences": ["Your bike is good. Mine is even ___.", "This bike is bad. That one is even ___."], "answers": ["better", "worse"], "prefixes": ["b", "w"]},
                {"id": "M12", "sentences": ["My brother is older ___ me.", "Your house ___ bigger than my house."], "answers": ["than", "is"]},
                {"id": "M25", "sentences": ["My sister is taller ___ me.", "My brother ___ younger ___ me."], "answers": ["than", "is", "than"]},
                {"id": "M26", "sentences": ["This bag is ___ than that bag.", "That bag ___ smaller ___ this bag."], "answers": ["bigger", "is", "than"]},
                {"id": "M27", "sentences": ["My hair is longer ___ yours.", "Your hair ___ ___ ___ mine."], "answers": ["than", "is", "shorter", "than"]}
            ],
            fix: [
                {"id": "F11", "sentence": "This dog is biger than that dog.", "wrongWord": "biger", "answer": "bigger"},
                {"id": "F12", "sentence": "That kitten is thiner than this kitten.", "wrongWord": "thiner", "answer": "thinner"},
                {"id": "F13", "sentence": "He looks happyer than his brother.", "wrongWord": "happyer", "answer": "happier"},
                {"id": "F14", "sentence": "This puppy is naughtyer than that puppy.", "wrongWord": "naughtyer", "answer": "naughtier"},
                {"id": "F15", "sentence": "My new bike is gooder than my old one.", "wrongWord": "gooder", "answer": "better"},
                {"id": "F16", "sentence": "Today's weather is badder than yesterday's.", "wrongWord": "badder", "answer": "worse"},
                {"id": "F17", "sentence": "My sister is taller that me.", "wrongWord": "that", "answer": "than"},
                {"id": "F18", "sentence": "Their house are bigger than our house.", "wrongWord": "are", "answer": "is"},
                {"id": "F33", "sentence": "My sister is taller then me.", "wrongWord": "then", "answer": "than"},
                {"id": "F34", "sentence": "This bag is bigger as that bag.", "wrongWord": "as", "answer": "than"},
                {"id": "F35", "sentence": "My brother is younger to me.", "wrongWord": "to", "answer": "than"},
                {"id": "F36", "sentence": "My hair is longer of your hair.", "wrongWord": "of", "answer": "than"}
            ]
        },
        54: {
            missing: [
                {"id": "M13", "sentences": ["This is my book. It's ___.", "This is your bag. It's ___."], "answers": ["mine", "yours"]},
                {"id": "M14", "sentences": ["This is his bike. It's ___.", "This is her doll. It's ___."], "answers": ["his", "hers"]},
                {"id": "M15", "sentences": ["This is our house. It's ___.", "This is their car. It's ___."], "answers": ["ours", "theirs"]},
                {"id": "M16", "sentences": ["My ruler is long. Your ruler is short. My ruler is longer than ___.", "Your ruler is shorter than ___."], "answers": ["yours", "mine"]},
                {"id": "M17", "sentences": ["Her bag is bigger than my bag. Her bag is bigger than ___.", "His bike is newer than her bike. His bike is newer than ___."], "answers": ["mine", "hers"]},
                {"id": "M18", "sentences": ["Your garden is smaller than our garden. Yours is smaller than ___.", "Our house is bigger than their house. Ours is bigger than ___."], "answers": ["ours", "theirs"]},
                {"id": "M19", "sentences": ["We park our car in the ___.", "We grow flowers in the ___."], "answers": ["garage", "garden"], "prefixes": ["g", "g"]},
                {"id": "M20", "sentences": ["The ___ is the top of the house.", "The ___ is below the ground floor."], "answers": ["roof", "basement"], "prefixes": ["r", "b"]},
                {"id": "M21", "sentences": ["We walk up the ___.", "We can take the ___ instead."], "answers": ["stairs", "lift"], "prefixes": ["s", "l"]},
                {"id": "M22", "sentences": ["Mum is on the first floor. I'm on the ground floor.", "Mum is ___ and I'm ___."], "answers": ["upstairs", "downstairs"], "prefixes": ["u", "d"]},
                {"id": "M23", "sentences": ["The floor above the ground floor is the ___ floor.", "The floor above the first floor is the ___ floor."], "answers": ["first", "second"], "prefixes": ["f", "s"]},
                {"id": "M24", "sentences": ["Our flat's got a ___. We can stand outside on it.", "We live on the floor above the second floor. It's the ___ floor."], "answers": ["balcony", "third"], "prefixes": ["b", "t"]},
                {"id": "M28", "sentences": ["We walk on the ___ inside the house.", "The ___ covers the top of the house."], "answers": ["floor", "roof"]},
                {"id": "M29", "sentences": ["Our flat is on the second ___.", "There's a bird on the ___ of our house."], "answers": ["floor", "roof"]},
                {"id": "M30", "sentences": ["The ___ above the first floor is the second floor.", "Rain falls on the ___ at the top of the house."], "answers": ["floor", "roof"]}
            ],
            fix: [
                {"id": "F19", "sentence": "This is my book. It's my.", "wrongWord": "my", "answer": "mine", "wrongIndex": 5},
                {"id": "F20", "sentence": "This is your bag. It's your.", "wrongWord": "your", "answer": "yours", "wrongIndex": 5},
                {"id": "F21", "sentence": "This is her doll. It's her.", "wrongWord": "her", "answer": "hers", "wrongIndex": 5},
                {"id": "F22", "sentence": "This is our house. It's our.", "wrongWord": "our", "answer": "ours", "wrongIndex": 5},
                {"id": "F23", "sentence": "This is their car. It's their.", "wrongWord": "their", "answer": "theirs", "wrongIndex": 5},
                {"id": "F24", "sentence": "This is his bike. It's he's.", "wrongWord": "he's", "answer": "his"},
                {"id": "F25", "sentence": "My ruler is longer than your.", "wrongWord": "your", "answer": "yours"},
                {"id": "F26", "sentence": "Her bag is bigger than my.", "wrongWord": "my", "answer": "mine"},
                {"id": "F27", "sentence": "The room where we park our car is the kitchen.", "wrongWord": "kitchen", "answer": "garage"},
                {"id": "F28", "sentence": "The part on top of the house is the basement.", "wrongWord": "basement", "answer": "roof"},
                {"id": "F29", "sentence": "The room below the ground floor is the roof.", "wrongWord": "roof", "answer": "basement"},
                {"id": "F30", "sentence": "We walk up the lift to get to the next floor.", "wrongWord": "lift", "answer": "stairs"},
                {"id": "F31", "sentence": "The floor above the ground floor is the third floor.", "wrongWord": "third", "answer": "first"},
                {"id": "F32", "sentence": "My flat has a basement where I can stand outside above the street.", "wrongWord": "basement", "answer": "balcony"},
                {"id": "F37", "sentence": "Our flat is on the second roof.", "wrongWord": "roof", "answer": "floor"},
                {"id": "F38", "sentence": "The bird is sitting on the floor at the top of the house.", "wrongWord": "floor", "answer": "roof"},
                {"id": "F39", "sentence": "My bedroom is upstairs, on the first roof.", "wrongWord": "roof", "answer": "floor"},
                {"id": "F40", "sentence": "The roof inside my bedroom is covered with a carpet.", "wrongWord": "roof", "answer": "floor"}
            ]
        }
    };

    // PU2 Unit 5: teacher-approved animals, superlatives, actions and diet boards.
    const pu2Unit5Catalogs = {
        57: {
            missing: [
                {"id": "M1", "sentences": ["The black-and-white bear that eats bamboo is a ___.", "The black-and-white bird that swims but can't fly is a ___."], "answers": ["panda", "penguin"], "prefixes": ["p", "p"]},
                {"id": "M2", "sentences": ["A ___ is a big cat with long hair.", "A ___ has long ears and hops on land."], "answers": ["lion", "rabbit"], "prefixes": ["l", "r"]},
                {"id": "M3", "sentences": ["A ___ can fly, but it isn't a bird.", "A ___ is a colourful bird that can sometimes speak."], "answers": ["bat", "parrot"], "prefixes": ["b", "p"]},
                {"id": "M4", "sentences": ["A ___ carries its baby in a pouch.", "A blue ___ is the biggest animal in the sea."], "answers": ["kangaroo", "whale"], "prefixes": ["k", "w"]},
                {"id": "M5", "sentences": ["A ___ is a clever sea animal with a long nose.", "A ___ is a large animal that can climb trees and eat fish."], "answers": ["dolphin", "bear"], "prefixes": ["d", "b"]},
                {"id": "M6", "sentences": ["We visit a ___ ___ to see wild animals.", "A ___ has bars to keep an animal inside."], "answers": ["wildlife", "park", "cage"], "prefixes": ["w", "p", "c"]}
            ],
            fix: [
                {"id": "F1", "sentence": "The black-and-white bear that eats bamboo is a penguin.", "wrongWord": "penguin", "answer": "panda"},
                {"id": "F2", "sentence": "The black-and-white bird that swims but can't fly is a panda.", "wrongWord": "panda", "answer": "penguin"},
                {"id": "F3", "sentence": "The big cat with long hair is a rabbit.", "wrongWord": "rabbit", "answer": "lion"},
                {"id": "F4", "sentence": "The biggest animal in the sea is a dolphin.", "wrongWord": "dolphin", "answer": "whale"},
                {"id": "F5", "sentence": "The colourful bird that can sometimes speak is a bat.", "wrongWord": "bat", "answer": "parrot"},
                {"id": "F6", "sentence": "The lion is behind the bars of its suitcase.", "wrongWord": "suitcase", "answer": "cage"},
                {"id": "F7", "sentence": "A dolphin carries its baby in a pouch and jumps on two strong back legs.", "wrongWord": "dolphin", "answer": "kangaroo"},
                {"id": "F8", "sentence": "A whale is a small animal with long ears that hops on land.", "wrongWord": "whale", "answer": "rabbit"}
            ]
        },
        60: {
            missing: [
                {"id": "M7", "sentences": ["Grandma is 70, Mum is 40 and I'm 8. Grandma is the ___.", "I'm the ___."], "answers": ["oldest", "youngest"], "prefixes": ["o", "y"]},
                {"id": "M8", "sentences": ["Tom is taller than Jim and Ben. Tom is the ___ of the three.", "Ben is shorter than Tom and Jim. Ben is the ___."], "answers": ["tallest", "shortest"], "prefixes": ["t", "s"]},
                {"id": "M9", "sentences": ["The red ball is bigger than the other two. It's the ___.", "The blue ball is smaller than the other two. It's the ___."], "answers": ["biggest", "smallest"], "prefixes": ["b", "s"]},
                {"id": "M10", "sentences": ["This kitten is pretty. I think it's the ___ of all.", "These boots are dirty. They're the ___ of all."], "answers": ["prettiest", "dirtiest"], "prefixes": ["p", "d"]},
                {"id": "M11", "sentences": ["This clown is funny. I think he's the ___ of all.", "Today I'm happier than ever. It's the ___ day of my life!"], "answers": ["funniest", "happiest"], "prefixes": ["f", "h"]},
                {"id": "M12", "sentences": ["All three cats are fat, but this one is the ___.", "All three dogs are thin, but this one is the ___."], "answers": ["fattest", "thinnest"], "prefixes": ["f", "t"]},
                {"id": "M13", "sentences": ["This picture is good. I think it's the ___ of all.", "That picture is bad. I think it's the ___ of all."], "answers": ["best", "worst"], "prefixes": ["b", "w"]},
                {"id": "M14", "sentences": ["My brother is ___ tallest person in our family.", "He is taller ___ me."], "answers": ["the", "than"]},
                {"id": "M15", "sentences": ["This bag is bigger ___ yours.", "It's ___ biggest bag in the shop."], "answers": ["than", "the"]},
                {"id": "M16", "sentences": ["Tom is the ___ runner in our class. No one can run as fast as him.", "My snail is the ___ of the three. The other two move faster."], "answers": ["fastest", "slowest"], "prefixes": ["f", "s"]},
                {"id": "M17", "sentences": ["Bears can ___ trees.", "Look! That bear is ___ a tree."], "answers": ["climb", "climbing"], "prefixes": ["c", "c"]},
                {"id": "M18", "sentences": ["Bats can ___.", "Look! Those bats are ___ above the trees."], "answers": ["fly", "flying"], "prefixes": ["f", "f"]},
                {"id": "M19", "sentences": ["Rabbits can ___ behind rocks.", "Look! That rabbit is ___ behind a rock."], "answers": ["hide", "hiding"], "prefixes": ["h", "h"]},
                {"id": "M20", "sentences": ["Lions can ___ fast.", "Look! That lion is ___ after its food."], "answers": ["run", "running"], "prefixes": ["r", "r"]},
                {"id": "M21", "sentences": ["Keep your book in your bag so you don't ___ it.", "Look! A leaf is ___ from the tree."], "answers": ["lose", "falling"], "prefixes": ["l", "f"]},
                {"id": "M22", "sentences": ["Look! The snail is ___ very slowly.", "The penguin is ___ on the ice."], "answers": ["moving", "walking"], "prefixes": ["m", "w"]}
            ],
            fix: [
                {"id": "F9", "sentence": "My baby sister is the younger person in our family.", "wrongWord": "younger", "answer": "youngest"},
                {"id": "F10", "sentence": "Giraffes are the taller animals in the world.", "wrongWord": "taller", "answer": "tallest"},
                {"id": "F11", "sentence": "This ball is bigger than the other two. It's the bigger of the three.", "wrongWord": "bigger", "answer": "biggest", "wrongIndex": 10},
                {"id": "F12", "sentence": "This is the prettyest kitten of all.", "wrongWord": "prettyest", "answer": "prettiest"},
                {"id": "F13", "sentence": "I think this clown is the funnyest of all.", "wrongWord": "funnyest", "answer": "funniest"},
                {"id": "F14", "sentence": "These are the dirtyest boots in the cupboard.", "wrongWord": "dirtyest", "answer": "dirtiest"},
                {"id": "F15", "sentence": "This is the thinest dog of the three.", "wrongWord": "thinest", "answer": "thinnest"},
                {"id": "F16", "sentence": "That is the fatest cat of the three.", "wrongWord": "fatest", "answer": "fattest"},
                {"id": "F17", "sentence": "This is the goodest picture in the competition.", "wrongWord": "goodest", "answer": "best"},
                {"id": "F18", "sentence": "That was the baddest day of my holiday.", "wrongWord": "baddest", "answer": "worst"},
                {"id": "F19", "sentence": "My brother is than tallest person in our family.", "wrongWord": "than", "answer": "the"},
                {"id": "F20", "sentence": "The blue whale is a biggest animal in the world.", "wrongWord": "a", "answer": "the"},
                {"id": "F21", "sentence": "This whale is bigger the that dolphin.", "wrongWord": "the", "answer": "than"},
                {"id": "F22", "sentence": "Of these three rabbits, this one is taller.", "wrongWord": "taller", "answer": "tallest"},
                {"id": "F23", "sentence": "Bears can climbing trees.", "wrongWord": "climbing", "answer": "climb"},
                {"id": "F24", "sentence": "Look! The lion is run after its food.", "wrongWord": "run", "answer": "running"},
                {"id": "F25", "sentence": "The rabbits are hide behind the rocks.", "wrongWord": "hide", "answer": "hiding"},
                {"id": "F26", "sentence": "Look! The bat is fly above the tree.", "wrongWord": "fly", "answer": "flying"}
            ]
        },
        62: {
            missing: [
                {"id": "M23", "sentences": ["The plane is higher than the tree. It's ___ the tree.", "The snail is lower than the flower. It's ___ the flower."], "answers": ["above", "below"]},
                {"id": "M24", "sentences": ["The zoo is across the road from the park. It's ___ the park.", "My house is only a minute's walk from school. It's ___ the school."], "answers": ["opposite", "near"], "prefixes": ["o", "n"]},
                {"id": "M25", "sentences": ["Animals that eat only ___ and ___ are carnivores.", "Wolves, polar bears and penguins are ___."], "answers": ["meat", "fish", "carnivores"], "prefixes": ["m", "f", "c"]},
                {"id": "M26", "sentences": ["Animals that eat both ___ and ___ are omnivores.", "People, pigs and dogs are ___."], "answers": ["meat", "plants", "omnivores"], "prefixes": ["m", "p", "o"]},
                {"id": "M27", "sentences": ["Animals that only eat ___ are herbivores.", "Rabbits, pandas, and cows are ___."], "answers": ["plants", "herbivores"], "prefixes": ["p", "h"]},
                {"id": "M28", "sentences": ["Brown ___ eat meat and plants. They're omnivores.", "___ ___ only eat meat and fish. They're carnivores."], "answers": ["bears", "polar", "bears"], "prefixes": ["b", "p", "b"]}
            ],
            fix: [
                {"id": "F27", "sentence": "The snail is lower than the flower. It's above the flower.", "wrongWord": "above", "answer": "below"},
                {"id": "F28", "sentence": "The kite is higher than the roof. It's below the roof.", "wrongWord": "below", "answer": "above"},
                {"id": "F29", "sentence": "The zoo is across the road from the park. It's between the park.", "wrongWord": "between", "answer": "opposite"},
                {"id": "F30", "sentence": "The school is next to my house. It's opposite my house.", "wrongWord": "opposite", "answer": "near"},
                {"id": "F31", "sentence": "Lions eat plants. They're carnivores.", "wrongWord": "plants", "answer": "meat"},
                {"id": "F32", "sentence": "Rabbits eat meat. They're herbivores.", "wrongWord": "meat", "answer": "plants"},
                {"id": "F33", "sentence": "People eat both meat and poopoo. We're omnivores.", "wrongWord": "poopoo", "answer": "plants"},
                {"id": "F34", "sentence": "Carnivores only eat plants and fish.", "wrongWord": "plants", "answer": "meat"}
            ]
        }
    };

    // PU2 Unit 6: approved weather, clothes, past be and review boards.
    const pu2Unit6Catalogs = {
        78: {
            missing: [
                {"id": "M1", "sentences": ["There's a ___ in the sky.", "It's a ___ day."], "answers": ["cloud", "cloudy"], "prefixes": ["c", "c"]},
                {"id": "M2", "sentences": ["There's ___ on the window.", "It's a ___ day."], "answers": ["rain", "rainy"], "prefixes": ["r", "r"]},
                {"id": "M3", "sentences": ["There's ___ on the ground.", "It's a cold, ___ day."], "answers": ["snow", "snowy"], "prefixes": ["s", "s"]},
                {"id": "M4", "sentences": ["The ___ is blowing the trees.", "It's a ___ day."], "answers": ["wind", "windy"], "prefixes": ["w", "w"]},
                {"id": "M6", "sentences": ["The ___ is shining.", "It's a hot, ___ day."], "answers": ["sun", "sunny"], "prefixes": ["s", "s"]},
                {"id": "M7", "sentences": ["After the rain, I can see a ___ with lots of colours.", "I use an ___ to keep the rain off me."], "answers": ["rainbow", "umbrella"], "prefixes": ["r", "u"]},
                {"id": "M8", "sentences": ["I wear a ___ around my neck when it's cold.", "I wear ___ on my hands."], "answers": ["scarf", "gloves"], "prefixes": ["s", "g"]},
                {"id": "M9", "sentences": ["I wear ___ on my feet when it's wet.", "I wear a ___ to keep my clothes dry in the rain."], "answers": ["boots", "raincoat"], "prefixes": ["b", "r"]},
                {"id": "M10", "sentences": ["I wear a ___ over my shirt when it's cold.", "I wear a ___ on my head."], "answers": ["sweater", "hat"], "prefixes": ["s", "h"]},
                {"id": "M11", "sentences": ["I ___ at home yesterday.", "We ___ at the park last week."], "answers": ["was", "were"]},
                {"id": "M12", "sentences": ["She ___ cold last night.", "They ___ tired yesterday."], "answers": ["was", "were"]},
                {"id": "M13", "sentences": ["It ___ cold yesterday.", "___ hot today."], "answers": ["was", "it's"]},
                {"id": "M14", "sentences": ["We ___ on holiday last week.", "___ at school today."], "answers": ["were", "we're"]},
                {"id": "M15", "sentences": ["I ___ at school yesterday. I was at home.", "We ___ at the park. We were at the cinema."], "answers": ["wasn't", "weren't"]},
                {"id": "M16", "sentences": ["He ___ hungry. He didn't want any food.", "They ___ cold. They wanted to take off their coats."], "answers": ["wasn't", "weren't"]},
                {"id": "M17", "sentences": ["There ___ a rainbow yesterday.", "There ___ lots of clouds yesterday morning."], "answers": ["was", "were"]},
                {"id": "M18", "sentences": ["There ___ a scarf on the chair last night.", "There ___ two gloves next to it."], "answers": ["was", "were"]},
                {"id": "M19", "sentences": ["The room was empty. There ___ a coat in it.", "There ___ any boots either."], "answers": ["wasn't", "weren't"]},
                {"id": "M20", "sentences": ["Where ___ you yesterday?", "What ___ the weather like last week?"], "answers": ["were", "was"]}
            ],
            fix: [
                {"id": "F1", "sentence": "It's cloud today.", "wrongWord": "cloud", "answer": "cloudy"},
                {"id": "F2", "sentence": "There's a lot of rainy on the window.", "wrongWord": "rainy", "answer": "rain"},
                {"id": "F3", "sentence": "It was snow yesterday.", "wrongWord": "snow", "answer": "snowy"},
                {"id": "F4", "sentence": "The windy is blowing.", "wrongWord": "windy", "answer": "wind"},
                {"id": "F6", "sentence": "The sunny is shining.", "wrongWord": "sunny", "answer": "sun"},
                {"id": "F7", "sentence": "There's a colourful umbrella in the sky after the rain.", "wrongWord": "umbrella", "answer": "rainbow"},
                {"id": "F8", "sentence": "I wear a scarf on each hand when it's cold.", "wrongWord": "scarf", "answer": "glove"},
                {"id": "F9", "sentence": "I put my gloves around my neck to keep it warm.", "wrongWord": "gloves", "answer": "scarf"},
                {"id": "F10", "sentence": "I wear a coat on my head.", "wrongWord": "coat", "answer": "hat"},
                {"id": "F11", "sentence": "These gloves keep my feet dry in the rain.", "wrongWord": "gloves", "answer": "boots"},
                {"id": "F12", "sentence": "Yesterday I am at home.", "wrongWord": "am", "answer": "was"},
                {"id": "F13", "sentence": "Last week we are on holiday.", "wrongWord": "are", "answer": "were"},
                {"id": "F14", "sentence": "She were cold last night.", "wrongWord": "were", "answer": "was"},
                {"id": "F15", "sentence": "They was at the park yesterday.", "wrongWord": "was", "answer": "were"},
                {"id": "F16", "sentence": "It is sunny yesterday.", "wrongWord": "is", "answer": "was"},
                {"id": "F17", "sentence": "I was at school right now.", "wrongWord": "was", "answer": "am"},
                {"id": "F18", "sentence": "We were at school right now.", "wrongWord": "were", "answer": "are"},
                {"id": "F19", "sentence": "I weren't at school yesterday. I was at home.", "wrongWord": "weren't", "answer": "wasn't"},
                {"id": "F20", "sentence": "They wasn't at the park. They were at the cinema.", "wrongWord": "wasn't", "answer": "weren't"},
                {"id": "F21", "sentence": "There were a scarf on the chair last night.", "wrongWord": "were", "answer": "was"},
                {"id": "F22", "sentence": "There was two boots by the door yesterday.", "wrongWord": "was", "answer": "were"},
                {"id": "F23", "sentence": "The room was empty. There wasn't any coats in it.", "wrongWord": "wasn't", "answer": "weren't"},
                {"id": "F24", "sentence": "Where was you yesterday?", "wrongWord": "was", "answer": "were"}
            ]
        },
        81: {
            missing: [
                {"id": "M21", "sentences": ["This is my coat. It's ___.", "Those are your gloves. They're ___."], "answers": ["mine", "yours"]},
                {"id": "M22", "sentences": ["My scarf is longer ___ yours.", "It's ___ longest scarf in our family."], "answers": ["than", "the"]},
                {"id": "M23", "sentences": ["I'm ten. My cousin is eight. I'm ___ than my cousin.", "My baby sister is the ___ in our family."], "answers": ["older", "youngest"], "prefixes": ["o", "y"]},
                {"id": "M24", "sentences": ["The plane is higher than the clouds. It's ___ them.", "The river is lower than the bridge. It's ___ it."], "answers": ["above", "below"]}
            ],
            fix: [
                {"id": "F25", "sentence": "This is my coat. It's my.", "wrongWord": "my", "answer": "mine", "wrongIndex": 5},
                {"id": "F26", "sentence": "These are her gloves. They're her.", "wrongWord": "her", "answer": "hers", "wrongIndex": 5},
                {"id": "F27", "sentence": "My scarf is longer that yours.", "wrongWord": "that", "answer": "than"},
                {"id": "F28", "sentence": "This is than longest scarf in the shop.", "wrongWord": "than", "answer": "the"},
                {"id": "F29", "sentence": "Of the three children, my baby brother is the younger.", "wrongWord": "younger", "answer": "youngest"},
                {"id": "F30", "sentence": "The kite is higher than the tree. It's below the tree.", "wrongWord": "below", "answer": "above"}
            ]
        }
    };

    // PU2 Unit 7: approved food, irregular/regular past and did/base-verb boards.
    const pu2Unit7Catalogs = {
        83: {
            missing: [
                {"id": "M1", "sentences": ["I've got some bread and some ___.", "I can make a ___ ___."], "answers": ["cheese", "cheese", "sandwich"], "prefixes": ["ch", "ch", "s"]},
                {"id": "M2", "sentences": ["Carrots, onions and potatoes are ___.", "We can cook them in water to make vegetable ___."], "answers": ["vegetables", "soup"], "prefixes": ["v", "s"]},
                {"id": "M3", "sentences": ["I eat soup from a ___.", "I eat pasta from a ___."], "answers": ["bowl", "plate"], "prefixes": ["b", "p"]},
                {"id": "M4", "sentences": ["I drink hot chocolate from a ___.", "I drink lemonade from a ___."], "answers": ["cup", "glass"], "prefixes": ["c", "g"]},
                {"id": "M5", "sentences": ["We keep lemonade in a ___.", "We make ___ with lemons, water and sugar."], "answers": ["bottle", "lemonade"], "prefixes": ["b", "l"]},
                {"id": "M6", "sentences": ["I put cheese between two pieces of bread to make a ___.", "I mix lettuce and tomatoes to make a ___."], "answers": ["sandwich", "salad"], "prefixes": ["s", "s"]}
            ],
            fix: [
                {"id": "F1", "sentence": "We make a sandwich with two pieces of paper.", "wrongWord": "paper", "answer": "bread"},
                {"id": "F2", "sentence": "Carrots, onions and potatoes are drinks.", "wrongWord": "drinks", "answer": "vegetables"},
                {"id": "F3", "sentence": "A bottle is a deep, round dish for soup.", "wrongWord": "bottle", "answer": "bowl"},
                {"id": "F4", "sentence": "A plate is a small container with a handle for hot drinks.", "wrongWord": "plate", "answer": "cup"},
                {"id": "F5", "sentence": "The drink made from lemons is called soup.", "wrongWord": "soup", "answer": "lemonade"},
                {"id": "F6", "sentence": "There are three bottle of lemonade on the table.", "wrongWord": "bottle", "answer": "bottles"},
                {"id": "F7", "sentence": "There is two cups of hot chocolate.", "wrongWord": "is", "answer": "are"},
                {"id": "F8", "sentence": "I'd like a glass of lemonades.", "wrongWord": "lemonades", "answer": "lemonade"}
            ]
        },
        85: {
            missing: [
                {"id": "M7", "sentences": ["I usually ___ to school by bus.", "Yesterday I ___ to school by car."], "answers": ["go", "went"], "prefixes": ["g", "w"]},
                {"id": "M8", "sentences": ["I usually ___ milk with breakfast.", "Yesterday I ___ orange juice."], "answers": ["drink", "drank"], "prefixes": ["d", "d"]},
                {"id": "M9", "sentences": ["I usually ___ bread for breakfast.", "Yesterday I ___ some cake."], "answers": ["eat", "ate"], "prefixes": ["e", "a"]},
                {"id": "M10", "sentences": ["We usually ___ sandwiches for lunch.", "Yesterday we ___ soup."], "answers": ["have", "had"], "prefixes": ["h", "h"]},
                {"id": "M11", "sentences": ["I often ___ lunch with Dad.", "Yesterday we ___ a pasta salad."], "answers": ["make", "made"], "prefixes": ["m", "m"]},
                {"id": "M12", "sentences": ["I usually ___ my homework after school.", "Yesterday I ___ it before dinner."], "answers": ["do", "did"], "prefixes": ["d", "d"]},
                {"id": "M13", "sentences": ["I usually ___ my lunch to school.", "Yesterday I ___ a cheese sandwich."], "answers": ["bring", "brought"], "prefixes": ["b", "b"]},
                {"id": "M14", "sentences": ["We usually ___ vegetables from the shop.", "Yesterday we ___ some carrots."], "answers": ["get", "got"], "prefixes": ["g", "g"]},
                {"id": "M15", "sentences": ["Yesterday I ___ a parrot in the garden.", "I ___ some food in its bowl."], "answers": ["saw", "put"], "prefixes": ["s", "p"]},
                {"id": "M16", "sentences": ["___ you make soup yesterday?", "I ___ make any soup. I only made a sandwich."], "answers": ["did", "didn't"]}
            ],
            fix: [
                {"id": "F9", "sentence": "Yesterday I goed to the shop.", "wrongWord": "goed", "answer": "went"},
                {"id": "F10", "sentence": "She drinked orange juice yesterday.", "wrongWord": "drinked", "answer": "drank"},
                {"id": "F11", "sentence": "We eated pasta for dinner last night.", "wrongWord": "eated", "answer": "ate"},
                {"id": "F12", "sentence": "They haved lunch at school yesterday.", "wrongWord": "haved", "answer": "had"},
                {"id": "F13", "sentence": "Dad maked vegetable soup yesterday.", "wrongWord": "maked", "answer": "made"},
                {"id": "F14", "sentence": "I doed my homework last night.", "wrongWord": "doed", "answer": "did"},
                {"id": "F15", "sentence": "Yesterday I bringed my lunch to school.", "wrongWord": "bringed", "answer": "brought"},
                {"id": "F16", "sentence": "Yesterday we getted some vegetables from the shop.", "wrongWord": "getted", "answer": "got"},
                {"id": "F17", "sentence": "I seed a parrot in the garden yesterday.", "wrongWord": "seed", "answer": "saw"},
                {"id": "F18", "sentence": "She putted strawberries on the cake.", "wrongWord": "putted", "answer": "put"},
                {"id": "F19", "sentence": "Did you went to the shop yesterday?", "wrongWord": "went", "answer": "go"},
                {"id": "F20", "sentence": "I didn't ate the soup.", "wrongWord": "ate", "answer": "eat"}
            ]
        },
        87: {
            missing: [
                {"id": "M17", "sentences": ["I ___ my hands before meals.", "Yesterday I ___ them before dinner."], "answers": ["wash", "washed"], "prefixes": ["w", "w"]},
                {"id": "M18", "sentences": ["I often ___ dinner with Dad.", "Yesterday we ___ pasta."], "answers": ["cook", "cooked"], "prefixes": ["c", "c"]},
                {"id": "M19", "sentences": ["We usually ___ eggs for breakfast.", "Yesterday Dad ___ onions."], "answers": ["fry", "fried"], "prefixes": ["f", "f"]},
                {"id": "M20", "sentences": ["Can you ___ these bags?", "I ___ them yesterday."], "answers": ["carry", "carried"], "prefixes": ["c", "c"]},
                {"id": "M21", "sentences": ["I always ___ when the traffic light is red.", "Yesterday I ___ at a red light."], "answers": ["stop", "stopped"], "prefixes": ["s", "s"]},
                {"id": "M22", "sentences": ["Be careful! Don't ___ that plate.", "Yesterday I ___ a plate and it broke."], "answers": ["drop", "dropped"], "prefixes": ["d", "d"]},
                {"id": "M23", "sentences": ["I ___ cooking with my friends.", "I ___ our cooking lesson yesterday."], "answers": ["like", "liked"], "prefixes": ["l", "l"]},
                {"id": "M24", "sentences": ["I always ___ for photos.", "Yesterday I ___ at Dad's camera."], "answers": ["smile", "smiled"], "prefixes": ["s", "s"]},
                {"id": "M25", "sentences": ["I sometimes ___ when a film is sad.", "Yesterday I ___ at the end of a sad film."], "answers": ["cry", "cried"], "prefixes": ["c", "c"]},
                {"id": "M26", "sentences": ["We ___ pasta in water.", "Yesterday we ___ it for ten minutes."], "answers": ["boil", "boiled"], "prefixes": ["b", "b"]},
                {"id": "M27", "sentences": ["___ you cook the pasta yesterday?", "I ___ cook any pasta. I only made soup."], "answers": ["did", "didn't"]},
                {"id": "M28", "sentences": ["Where ___ you cook yesterday?", "What ___ you cooking now?"], "answers": ["did", "are"]}
            ],
            fix: [
                {"id": "F21", "sentence": "Yesterday we wash our hands before dinner.", "wrongWord": "wash", "answer": "washed"},
                {"id": "F22", "sentence": "Yesterday Dad cook pasta for lunch.", "wrongWord": "cook", "answer": "cooked"},
                {"id": "F23", "sentence": "He fryed the onions yesterday.", "wrongWord": "fryed", "answer": "fried"},
                {"id": "F24", "sentence": "I carryed the shopping bags yesterday.", "wrongWord": "carryed", "answer": "carried"},
                {"id": "F25", "sentence": "The rain stoped at four o'clock yesterday.", "wrongWord": "stoped", "answer": "stopped"},
                {"id": "F26", "sentence": "He droped his favourite plate yesterday.", "wrongWord": "droped", "answer": "dropped"},
                {"id": "F27", "sentence": "I likeed our cooking lesson yesterday.", "wrongWord": "likeed", "answer": "liked"},
                {"id": "F28", "sentence": "Sally smileed at the camera.", "wrongWord": "smileed", "answer": "smiled"},
                {"id": "F29", "sentence": "I cryed at the end of the sad film.", "wrongWord": "cryed", "answer": "cried"},
                {"id": "F30", "sentence": "Yesterday we boil the potatoes for lunch.", "wrongWord": "boil", "answer": "boiled"},
                {"id": "F31", "sentence": "I inviteed my friends to my party last week.", "wrongWord": "inviteed", "answer": "invited"},
                {"id": "F32", "sentence": "The film was funny. We laugh a lot last night.", "wrongWord": "laugh", "answer": "laughed"},
                {"id": "F33", "sentence": "Did you cooked the vegetables?", "wrongWord": "cooked", "answer": "cook"},
                {"id": "F34", "sentence": "We didn't washed the carrots.", "wrongWord": "washed", "answer": "wash"},
                {"id": "F35", "sentence": "She didn't carried the bags.", "wrongWord": "carried", "answer": "carry"},
                {"id": "F36", "sentence": "What did you fried for dinner?", "wrongWord": "fried", "answer": "fry"}
            ]
        }
    };

    // PU2 Unit 8: teacher-approved town, irregular past, obligation and safety boards.
    const pu2Unit8Catalogs = {
        95: {
            missing: [
                {"id": "M1", "sentences": ["We leave our car in a ___ ___.", "We catch a train at the ___ ___."], "answers": ["car", "park", "train", "station"], "prefixes": ["c", "p", "t", "s"]},
                {"id": "M2", "sentences": ["We buy a ___ before we get on the train.", "We use a ___ to know where to go."], "answers": ["ticket", "map"], "prefixes": ["t", "m"]},
                {"id": "M3", "sentences": ["The ___ has lots of exciting rides.", "My favourite ___ goes up and down very fast."], "answers": ["funfair", "ride"], "prefixes": ["f", "r"]},
                {"id": "M4", "sentences": ["The shops in the middle of town are in the ___ ___.", "Cars travel along the ___."], "answers": ["city", "centre", "road"], "prefixes": ["c", "c", "r"]}
            ],
            fix: [
                {"id": "F1", "sentence": "We leave our car in the car station.", "wrongWord": "station", "answer": "park"},
                {"id": "F2", "sentence": "We catch a train at the train park.", "wrongWord": "park", "answer": "station"},
                {"id": "F3", "sentence": "We have to buy a sandwich to get on the train.", "wrongWord": "sandwich", "answer": "ticket"},
                {"id": "F4", "sentence": "We use a menu to know where to go.", "wrongWord": "menu", "answer": "map"},
                {"id": "F5", "sentence": "The city centre is the part in the middle of the countryside.", "wrongWord": "countryside", "answer": "city"},
                {"id": "F6", "sentence": "We went on the exciting roads at the funfair.", "wrongWord": "roads", "answer": "rides"}
            ]
        },
        96: {
            missing: [
                {"id": "M5", "sentences": ["Yesterday Dad ___ two train tickets.", "He cooked his lunch at home, then ___ it on the train."], "answers": ["bought", "brought"], "prefixes": ["b", "b"]},
                {"id": "M6", "sentences": ["She ___ the red hat yesterday because red is her favourite colour.", "Dad ___ us to the beach yesterday."], "answers": ["chose", "drove"], "prefixes": ["c", "d"]},
                {"id": "M7", "sentences": ["I ___ my hat yesterday and couldn't find it,", "but then I ___ it this morning, under the bed."], "answers": ["lost", "found"], "prefixes": ["l", "f"]},
                {"id": "M8", "sentences": ["Grandma ___ me a present for my birthday yesterday.", "She and Grandpa ___ behind the sofa and said 'Surprise!' when I came in."], "answers": ["gave", "hid"], "prefixes": ["g", "h"]},
                {"id": "M9", "sentences": ["We ___ our bikes to the park yesterday.", "I ___ my new helmet."], "answers": ["rode", "wore"], "prefixes": ["r", "w"]},
                {"id": "M10", "sentences": ["Yesterday I ___ next to Mum on the bus.", "My brother ___ very tired so he ___ next to us."], "answers": ["sat", "was", "slept"], "prefixes": ["s", "w", "s"]},
                {"id": "M11", "sentences": ["Yesterday I ___ near the door while Grandpa ___ us a story.", "Dad ___ a photo of us."], "answers": ["stood", "told", "took"], "prefixes": ["s", "t", "t"]}
            ],
            fix: [
                {"id": "F7", "sentence": "Dad buyed two train tickets yesterday.", "wrongWord": "buyed", "answer": "bought"},
                {"id": "F8", "sentence": "He bringed our lunch from home.", "wrongWord": "bringed", "answer": "brought"},
                {"id": "F9", "sentence": "She choosed the red hat yesterday.", "wrongWord": "choosed", "answer": "chose"},
                {"id": "F10", "sentence": "Dad drived us to the beach yesterday.", "wrongWord": "drived", "answer": "drove"},
                {"id": "F11", "sentence": "I finded my scarf under the bed.", "wrongWord": "finded", "answer": "found"},
                {"id": "F12", "sentence": "Grandma gived me a new sweater.", "wrongWord": "gived", "answer": "gave"},
                {"id": "F13", "sentence": "The rabbit hided behind a tree.", "wrongWord": "hided", "answer": "hid"},
                {"id": "F14", "sentence": "I losed my hat yesterday.", "wrongWord": "losed", "answer": "lost"},
                {"id": "F15", "sentence": "We rided our bikes to the park yesterday.", "wrongWord": "rided", "answer": "rode"},
                {"id": "F16", "sentence": "I weared my new helmet yesterday.", "wrongWord": "weared", "answer": "wore"}
            ]
        },
        97: {
            missing: [
                {"id": "M12", "sentences": ["Yesterday my cousin ___ to our house.", "She ___ a picture for me."], "answers": ["came", "drew"], "prefixes": ["c", "d"]},
                {"id": "M13", "sentences": ["How many photos did you ___?", "I ___ five photos yesterday."], "answers": ["take", "took"], "prefixes": ["t", "t"]},
                {"id": "M14", "sentences": ["Which ice cream did she ___?", "She ___ chocolate."], "answers": ["choose", "chose"], "prefixes": ["c", "c"]},
                {"id": "M15", "sentences": ["What time did Jim ___ the fish?", "He ___ them at eight o'clock."], "answers": ["feed", "fed"], "prefixes": ["f", "f"]},
                {"id": "M16", "sentences": ["Where did the rabbit ___?", "It ___ in the garden."], "answers": ["sleep", "slept"], "prefixes": ["s", "s"]}
            ],
            fix: [
                {"id": "F17", "sentence": "I drawed a picture for Grandma yesterday.", "wrongWord": "drawed", "answer": "drew"},
                {"id": "F18", "sentence": "My cousin comed to our house yesterday.", "wrongWord": "comed", "answer": "came"},
                {"id": "F19", "sentence": "How many photos did you took?", "wrongWord": "took", "answer": "take"},
                {"id": "F20", "sentence": "Which ice cream did she chose?", "wrongWord": "chose", "answer": "choose"},
                {"id": "F21", "sentence": "What time did Jim fed the fish?", "wrongWord": "fed", "answer": "feed"},
                {"id": "F22", "sentence": "Where did the rabbit slept?", "wrongWord": "slept", "answer": "sleep"}
            ]
        },
        98: {
            missing: [
                {"id": "M17", "sentences": ["We borrow books from the ___.", "We watch films at the ___."], "answers": ["library", "cinema"], "prefixes": ["l", "c"]},
                {"id": "M18", "sentences": ["Doctors and nurses work at a ___.", "We buy fresh fruit and vegetables at the ___."], "answers": ["hospital", "market"], "prefixes": ["h", "m"]},
                {"id": "M19", "sentences": ["We buy food and other things at the ___.", "We buy clothes in the shops at the ___ ___."], "answers": ["supermarket", "shopping", "centre"], "prefixes": ["s", "s", "c"]},
                {"id": "M20", "sentences": ["We play indoor sports at the ___ ___.", "We swim at the ___ ___."], "answers": ["sports", "centre", "swimming", "pool"], "prefixes": ["s", "c", "s", "p"]},
                {"id": "M21", "sentences": ["We wait for a bus at the ___ ___.", "We can have a drink and a snack at a ___."], "answers": ["bus", "station", "cafe"], "prefixes": ["b", "s", "c"]},
                {"id": "M22", "sentences": ["We sat in the town ___, an open place with buildings around it.", "We bought some fruit at the ___."], "answers": ["square", "market"], "prefixes": ["s", "m"]}
            ],
            fix: [
                {"id": "F23", "sentence": "We borrow books from the hospital.", "wrongWord": "hospital", "answer": "library"},
                {"id": "F24", "sentence": "We watch films on a big screen at the library.", "wrongWord": "library", "answer": "cinema"},
                {"id": "F25", "sentence": "Doctors and nurses help sick people at the cinema.", "wrongWord": "cinema", "answer": "hospital"},
                {"id": "F26", "sentence": "We buy clothes from the shops in the swimming centre.", "wrongWord": "swimming", "answer": "shopping"},
                {"id": "F27", "sentence": "We swim in the shopping pool.", "wrongWord": "shopping", "answer": "swimming"},
                {"id": "F28", "sentence": "A place with courts for playing sports is a shopping centre.", "wrongWord": "shopping", "answer": "sports"},
                {"id": "F29", "sentence": "We can catch a bus at the bus park.", "wrongWord": "park", "answer": "station"},
                {"id": "F30", "sentence": "We buy fresh vegetables from stalls at the library.", "wrongWord": "library", "answer": "market"}
            ]
        },
        104: {
            missing: [
                {"id": "M23", "sentences": ["I ___ to do my homework.", "She ___ to clean her bedroom."], "answers": ["have", "has"]},
                {"id": "M24", "sentences": ["My brother ___ ___ wear glasses.", "I ___ ___ wear them too."], "answers": ["has", "to", "have", "to"]},
                {"id": "M25", "sentences": ["___ you have to make your bed?", "___ she have to help at home?"], "answers": ["do", "does"]},
                {"id": "M26", "sentences": ["You ___ have to buy a ticket. Entry is free.", "He ___ have to wash the plates. They're already clean."], "answers": ["don't", "doesn't"]},
                {"id": "M27", "sentences": ["We walk on the ___ beside the road.", "We put rubbish in a ___ ___."], "answers": ["pavement", "litter", "bin"], "prefixes": ["p", "l", "b"]},
                {"id": "M28", "sentences": ["Drivers stop when the traffic light is ___.", "They can go when it turns ___."], "answers": ["red", "green"], "prefixes": ["r", "g"]},
                {"id": "M29", "sentences": ["We cross at a pedestrian ___.", "We wait for the green ___."], "answers": ["crossing", "light"], "prefixes": ["c", "l"]}
            ],
            fix: [
                {"id": "F31", "sentence": "I has to do my homework.", "wrongWord": "has", "answer": "have"},
                {"id": "F32", "sentence": "She have to clean her bedroom.", "wrongWord": "have", "answer": "has"},
                {"id": "F33", "sentence": "Do he have to wear glasses?", "wrongWord": "do", "answer": "does"},
                {"id": "F34", "sentence": "Does she has to help at home?", "wrongWord": "has", "answer": "have"},
                {"id": "F35", "sentence": "He don't have to buy a ticket. It's free.", "wrongWord": "don't", "answer": "doesn't"},
                {"id": "F36", "sentence": "We doesn't have to go to school on Sundays.", "wrongWord": "doesn't", "answer": "don't"},
                {"id": "F37", "sentence": "My brother has to wears glasses.", "wrongWord": "wears", "answer": "wear"},
                {"id": "F38", "sentence": "Put your rubbish in the litter bag.", "wrongWord": "bag", "answer": "bin"},
                {"id": "F39", "sentence": "Drivers must stop when the traffic light turns green.", "wrongWord": "green", "answer": "red"}
            ]
        }
    };

    // PU2 Unit 9: approved opinions, comparison patterns and cumulative review.
    const pu2Unit9Catalogs = {
        107: {
            missing: [
                {"id": "M1", "sentences": ["I need some water. I'm ___.", "I want something to eat. I'm ___."], "answers": ["thirsty", "hungry"], "prefixes": ["t", "h"]},
                {"id": "M2", "sentences": ["I need to sleep. I'm ___.", "Everyone suddenly shouted \"Happy birthday!\" I was very ___."], "answers": ["tired", "surprised"], "prefixes": ["t", "s"]},
                {"id": "M3", "sentences": ["I'm ___ of the dark.", "I'm ___ of big, angry dogs."], "answers": ["afraid", "frightened"], "prefixes": ["a", "f"]},
                {"id": "M4", "sentences": ["Nothing happened in the film. It was ___.", "The ride was fast and fun. It was ___."], "answers": ["boring", "exciting"], "prefixes": ["b", "e"]},
                {"id": "M5", "sentences": ["I got every answer right. The test was ___.", "I couldn't answer any questions. It was ___."], "answers": ["easy", "difficult"], "prefixes": ["e", "d"]},
                {"id": "M6", "sentences": ["Playing football in the road is ___.", "I wear a helmet ___ skateboarding can be dangerous."], "answers": ["dangerous", "because"], "prefixes": ["d", "b"]}
            ],
            fix: [
                {"id": "F1", "sentence": "I need some water because I'm hungry.", "wrongWord": "hungry", "answer": "thirsty"},
                {"id": "F2", "sentence": "I want something to eat because I'm thirsty.", "wrongWord": "thirsty", "answer": "hungry"},
                {"id": "F3", "sentence": "I need to sleep because I'm surprised.", "wrongWord": "surprised", "answer": "tired"},
                {"id": "F4", "sentence": "Everyone shouted \"Happy birthday!\" I didn't know about the party. I was tired.", "wrongWord": "tired", "answer": "surprised"},
                {"id": "F5", "sentence": "The film was exciting. Nothing happened and nobody enjoyed it.", "wrongWord": "exciting", "answer": "boring"},
                {"id": "F6", "sentence": "The ride was boring. Everyone thought it was so much fun!", "wrongWord": "boring", "answer": "exciting"},
                {"id": "F7", "sentence": "The test was easy. Everyone got 0/100.", "wrongWord": "easy", "answer": "difficult"},
                {"id": "F8", "sentence": "Fighting bears is very safe. You can get badly hurt doing it.", "wrongWord": "safe", "answer": "dangerous"}
            ]
        },
        109: {
            missing: [
                {"id": "M7", "sentences": ["I think this dress is ___ beautiful ___ that one.", "This skirt is shorter ___ that one."], "answers": ["more", "than", "than"]},
                {"id": "M8", "sentences": ["I think the circus is ___ ___ than the farm.", "I think this film is more ___ ___ that one."], "answers": ["more", "exciting", "boring", "than"], "prefixes": ["", "e", "b", ""]},
                {"id": "M9", "sentences": ["I think climbing is ___ ___ than walking.", "I think tigers are more ___ ___ rabbits."], "answers": ["more", "difficult", "dangerous", "than"], "prefixes": ["", "d", "d", ""]},
                {"id": "M10", "sentences": ["This test is easy, but yesterday's test ___ ___.", "I'm hungry, but my brother ___ ___ ___ me."], "answers": ["was", "easier", "is", "hungrier", "than"], "prefixes": ["w", "e", "", "h", "t"]},
                {"id": "M11", "sentences": ["I'm thirsty, but she's even ___ ___ me.", "I was tired, but Dad ___ ___ tired ___ me."], "answers": ["thirstier", "than", "was", "more", "than"], "prefixes": ["t", "t", "", "", ""]},
                {"id": "M12", "sentences": ["This bag is big, but that one is ___.", "This book is good, but that one is ___."], "answers": ["bigger", "better"], "prefixes": ["b", "b"]},
                {"id": "M13", "sentences": ["This game ___ ___ exciting ___ that one."], "answers": ["is", "more", "than"], "prefixes": ["", "m", "t"]},
                {"id": "M14", "sentences": ["Today's lesson ___ ___ interesting ___ yesterday's lesson.", "Yesterday's lesson ___ ___ ___ ___ today's."], "answers": ["is", "more", "than", "was", "more", "boring", "than"], "prefixes": ["", "", "", "w", "", "b", ""]}
            ],
            fix: [
                {"id": "F9", "sentence": "This dress is more beautifuler than that one.", "wrongWord": "beautifuler", "answer": "beautiful"},
                {"id": "F10", "sentence": "The circus is most exciting than the farm.", "wrongWord": "most", "answer": "more"},
                {"id": "F11", "sentence": "This game is more interesting then that one.", "wrongWord": "then", "answer": "than"},
                {"id": "F12", "sentence": "I think climbing is more difficult of walking.", "wrongWord": "of", "answer": "than"},
                {"id": "F13", "sentence": "This question is easyer than that one.", "wrongWord": "easyer", "answer": "easier"},
                {"id": "F14", "sentence": "I was hungryer than my brother.", "wrongWord": "hungryer", "answer": "hungrier"},
                {"id": "F15", "sentence": "She was thirstyer than me.", "wrongWord": "thirstyer", "answer": "thirstier"},
                {"id": "F16", "sentence": "This bag is biger than mine.", "wrongWord": "biger", "answer": "bigger"},
                {"id": "F17", "sentence": "This book is gooder than that one.", "wrongWord": "gooder", "answer": "better"},
                {"id": "F18", "sentence": "My brother are more tired than me.", "wrongWord": "are", "answer": "is"}
            ]
        },
        116: {
            missing: [
                {"id": "M15", "sentences": ["Of these three dresses, this is ___ ___ beautiful.", "I think it's ___ most beautiful dress in the shop."], "answers": ["the", "most", "the"]},
                {"id": "M16", "sentences": ["This film is more exciting ___ that one.", "It's ___ ___ exciting film of all."], "answers": ["than", "the", "most"]},
                {"id": "M17", "sentences": ["This is ___ ___ ___ ___ beautiful cities in the world.", "It's one of ___ ___ exciting places to visit."], "answers": ["one", "of", "the", "most", "the", "most"], "prefixes": ["o", "o", "", "m", "", ""]},
                {"id": "M18", "sentences": ["She's one of ___ ___ famous singers in the world.", "This is ___ ___ ___ ___ dangerous animals in the zoo."], "answers": ["the", "most", "one", "of", "the", "most"], "prefixes": ["", "m", "o", "o", "", ""]},
                {"id": "M19", "sentences": ["This question is ___ difficult than that one.", "It's the ___ difficult question in the test."], "answers": ["more", "most"]},
                {"id": "M20", "sentences": ["The first film was more interesting ___ the second.", "The third film was ___ most interesting of all."], "answers": ["than", "the"]},
                {"id": "M21", "sentences": ["In my family, my brother is the most ___ of spiders.", "Mum was the most ___ when we shouted \"Surprise!\""], "answers": ["frightened", "surprised"], "prefixes": ["f", "s"]},
                {"id": "M22", "sentences": ["I think this is the most ___ garden in town.", "He's a ___ singer. Lots of people know his songs."], "answers": ["beautiful", "famous"], "prefixes": ["b", "f"]}
            ],
            fix: [
                {"id": "F19", "sentence": "Of these five dresses, this is the more beautiful.", "wrongWord": "more", "answer": "most"},
                {"id": "F20", "sentence": "This is an most exciting ride in the park.", "wrongWord": "an", "answer": "the"},
                {"id": "F21", "sentence": "It's one in the most beautiful cities.", "wrongWord": "in", "answer": "of"},
                {"id": "F24", "sentence": "Of these three rides, this is the more exciting.", "wrongWord": "more", "answer": "most"},
                {"id": "F25", "sentence": "In my family, my brother is the most frightening of spiders.", "wrongWord": "frightening", "answer": "frightened"},
                {"id": "F26", "sentence": "Mum was the most surprise at her secret birthday party.", "wrongWord": "surprise", "answer": "surprised"},
                {"id": "F27", "sentence": "Of these three books, this is the most interested.", "wrongWord": "interested", "answer": "interesting"},
                {"id": "F28", "sentence": "It's one of the most exciting ride in the park.", "wrongWord": "ride", "answer": "rides"}
            ]
        },
        119: {
            missing: [
                {"id": "M23", "sentences": ["Yesterday Dad ___ soup.", "He ___ the onions first."], "answers": ["made", "fried"], "prefixes": ["m", "f"]},
                {"id": "M24", "sentences": ["Did you ___ a train ticket?", "I ___ one yesterday."], "answers": ["buy", "bought"], "prefixes": ["b", "b"]},
                {"id": "M25", "sentences": ["She ___ to wear glasses.", "___ she have to wear them at school?"], "answers": ["has", "does"]},
                {"id": "M26", "sentences": ["I ___ have to cook dinner. Dad is cooking it.", "She ___ have to wash the plates. They're already clean."], "answers": ["don't", "doesn't"]},
                {"id": "M27", "sentences": ["Yesterday we ___ to the market.", "We ___ some fresh vegetables."], "answers": ["went", "bought"], "prefixes": ["w", "b"]},
                {"id": "M28", "sentences": ["This ride is ___ exciting than the others.", "It's ___ most exciting ride at the funfair."], "answers": ["more", "the"]}
            ],
            fix: [
                {"id": "F29", "sentence": "Yesterday Dad maked soup.", "wrongWord": "maked", "answer": "made"},
                {"id": "F30", "sentence": "He fryed the onions first.", "wrongWord": "fryed", "answer": "fried"},
                {"id": "F31", "sentence": "Did you bought a ticket?", "wrongWord": "bought", "answer": "buy"},
                {"id": "F32", "sentence": "She have to wear glasses.", "wrongWord": "have", "answer": "has"},
                {"id": "F33", "sentence": "Does he has to wash the plates?", "wrongWord": "has", "answer": "have"},
                {"id": "F34", "sentence": "This game is most exciting than that one.", "wrongWord": "most", "answer": "more"},
                {"id": "F35", "sentence": "It's one of the most beautiful place in town.", "wrongWord": "place", "answer": "places"},
                {"id": "F36", "sentence": "This is than most interesting book in the library.", "wrongWord": "than", "answer": "the"}
            ]
        }
    };

    // PU1 Units 0-1: teacher-approved Hello and school boards.
    const pu1Unit0Catalogs = {
        5: {
            missing: [
                {"id": "M1", "sentences": ["___ your name?", "___ old are you?"], "answers": ["what's", "how"]},
                {"id": "M2", "sentences": ["What's ___ name?", "How old ___ you?"], "answers": ["your", "are"]},
                {"id": "M3", "sentences": ["I'm 1. I'm ___.", "I'm 2. I'm ___."], "answers": ["one", "two"], "prefixes": ["o", "t"]},
                {"id": "M4", "sentences": ["I'm 3. I'm ___.", "I'm 4. I'm ___."], "answers": ["three", "four"], "prefixes": ["t", "f"]},
                {"id": "M5", "sentences": ["I'm 5. I'm ___.", "I'm 6. I'm ___."], "answers": ["five", "six"], "prefixes": ["f", "s"]},
                {"id": "M6", "sentences": ["I'm 7. I'm ___.", "I'm 8. I'm ___."], "answers": ["seven", "eight"], "prefixes": ["s", "e"]},
                {"id": "M7", "sentences": ["I'm 9. I'm ___.", "I'm 10. I'm ___."], "answers": ["nine", "ten"], "prefixes": ["n", "t"]},
                {"id": "M8", "sentences": ["🟥 It's ___.", "🟦 It's ___."], "answers": ["red", "blue"], "prefixes": ["r", "b"]},
                {"id": "M9", "sentences": ["🟨 It's ___.", "🟩 It's ___."], "answers": ["yellow", "green"], "prefixes": ["y", "g"]},
            ],
            fix: [
                {"id": "F1", "sentence": "What your name?", "wrongWord": "what", "answer": "what's"},
                {"id": "F2", "sentence": "How name are you?", "wrongWord": "name", "answer": "old"},
                {"id": "F3", "sentence": "How old is you?", "wrongWord": "is", "answer": "are"},
                {"id": "F4", "sentence": "What's you name?", "wrongWord": "you", "answer": "your"},
                {"id": "F5", "sentence": "3 = four.", "wrongWord": "four", "answer": "three"},
                {"id": "F6", "sentence": "8 = six.", "wrongWord": "six", "answer": "eight"},
                {"id": "F7", "sentence": "🟥 This is blue.", "wrongWord": "blue", "answer": "red"},
                {"id": "F8", "sentence": "🟦 This is green.", "wrongWord": "green", "answer": "blue"},
            ],
        },
        7: {
            missing: [
                {"id": "M10", "sentences": ["___ bag is red.", "The pen ___ blue."], "answers": ["the", "is"]},
                {"id": "M11", "sentences": ["📘 This is a ___.", "✏️ This is a ___."], "answers": ["book", "pencil"], "prefixes": ["b", "p"]},
            ],
            fix: [
                {"id": "F9", "sentence": "The bag are red.", "wrongWord": "are", "answer": "is"},
                {"id": "F10", "sentence": "✏️ This is a book.", "wrongWord": "book", "answer": "pencil"},
            ],
        },
        8: {
            missing: [
                {"id": "M12", "sentences": ["___ my bag?", "___ in the box."], "answers": ["where's", "it's"]},
                {"id": "M13", "sentences": ["The pen is next ___ the book.", "___ is my bag? It's under the desk."], "answers": ["to", "where"]},
            ],
            fix: [
                {"id": "F11", "sentence": "Where the bag?", "wrongWord": "where", "answer": "where's"},
                {"id": "F12", "sentence": "Where are my bag?", "wrongWord": "are", "answer": "is"},
                {"id": "F13", "sentence": "The pen is next on the book.", "wrongWord": "on", "answer": "to"},
                {"id": "F14", "sentence": "Where's my book? They're in the bag.", "wrongWord": "they're", "answer": "it's"},
            ],
        },
    };
    const pu1Unit1Catalogs = {
        9: {
            missing: [
                {"id": "M1", "sentences": ["The book ___ on the desk.", "The books ___ on the desk."], "answers": ["is", "are"]},
                {"id": "M2", "sentences": ["The pencil ___ in the bag.", "The pencils ___ in the bag."], "answers": ["is", "are"]},
                {"id": "M3", "sentences": ["Where ___ the rubber?", "Where ___ the rubbers?"], "answers": ["is", "are"]},
                {"id": "M4", "sentences": ["Where's the book? ___ on the desk.", "Where are the books? ___ in the bag."], "answers": ["it's", "they're"]},
            ],
            fix: [
                {"id": "F1", "sentence": "The book are on the desk.", "wrongWord": "are", "answer": "is"},
                {"id": "F2", "sentence": "The pencils is in the bag.", "wrongWord": "is", "answer": "are"},
                {"id": "F3", "sentence": "Where is the rubbers?", "wrongWord": "is", "answer": "are"},
                {"id": "F4", "sentence": "Where are the crayons? It's in the pencil case.", "wrongWord": "it's", "answer": "they're"},
            ],
        },
        10: {
            missing: [
                {"id": "M5", "sentences": ["I draw a straight line with a ___.", "I write on ___."], "answers": ["ruler", "paper"], "prefixes": ["r", "p"]},
                {"id": "M6", "sentences": ["Open the ___.", "Look out of the ___."], "answers": ["door", "window"], "prefixes": ["d", "w"]},
            ],
            fix: [
                {"id": "F5", "sentence": "I use a rubber to draw straight lines.", "wrongWord": "rubber", "answer": "ruler"},
                {"id": "F6", "sentence": "I use a ruler to rub out pencil marks.", "wrongWord": "ruler", "answer": "rubber"},
                {"id": "F7", "sentence": "The books is in the bookcase.", "wrongWord": "is", "answer": "are"},
                {"id": "F8", "sentence": "The ruler is next on the book.", "wrongWord": "on", "answer": "to"},
            ],
        },
        11: {
            missing: [
                {"id": "M7", "sentences": ["What's ___? It's a window.", "What are ___? They're windows."], "answers": ["this", "these"]},
                {"id": "M8", "sentences": ["What ___ this? It's a door.", "What ___ these? They're doors."], "answers": ["is", "are"]},
                {"id": "M9", "sentences": ["What's this? ___ a cupboard.", "What are these? ___ cupboards."], "answers": ["it's", "they're"]},
                {"id": "M10", "sentences": ["One ruler. Two ___.", "One bookcase. Three ___."], "answers": ["rulers", "bookcases"], "prefixes": ["r", "b"]},
            ],
            fix: [
                {"id": "F9", "sentence": "What's these? It's a cupboard.", "wrongWord": "these", "answer": "this"},
                {"id": "F10", "sentence": "What are this? They're windows.", "wrongWord": "this", "answer": "these"},
                {"id": "F11", "sentence": "It's a rulers.", "wrongWord": "rulers", "answer": "ruler"},
                {"id": "F12", "sentence": "They're three window.", "wrongWord": "window", "answer": "windows"},
                {"id": "F13", "sentence": "These is my crayons.", "wrongWord": "is", "answer": "are"},
                {"id": "F14", "sentence": "This are my ruler.", "wrongWord": "are", "answer": "is"},
            ],
        },
        12: {
            missing: [
                {"id": "M11", "sentences": ["Are ___ OK?", "Yes, ___ you."], "answers": ["you", "thank"]},
                {"id": "M12", "sentences": ["Here you ___!", "___ you very much."], "answers": ["are", "thank"]},
            ],
            fix: [
                {"id": "F15", "sentence": "Are you OK? Yes, thanks you.", "wrongWord": "thanks", "answer": "thank"},
                {"id": "F16", "sentence": "Here you is!", "wrongWord": "is", "answer": "are"},
            ],
        },
        13: {
            missing: [
                {"id": "M13", "sentences": ["I ___ to the teacher.", "We work ___."], "answers": ["listen", "together"], "prefixes": ["l", "t"]},
                {"id": "M14", "sentences": ["I ___ my book.", "I ___ my classmates."], "answers": ["share", "help"], "prefixes": ["s", "h"]},
            ],
            fix: [
                {"id": "F17", "sentence": "I listen at the teacher.", "wrongWord": "at", "answer": "to"},
                {"id": "F18", "sentence": "I share me book.", "wrongWord": "me", "answer": "my"},
            ],
        },
        16: {
            missing: [
                {"id": "M15", "sentences": ["I am Jim. ___ Jim.", "You are Jenny. ___ Jenny."], "answers": ["i'm", "you're"]},
                {"id": "M16", "sentences": ["He is Jim. ___ Jim.", "She is Jenny. ___ Jenny."], "answers": ["he's", "she's"]},
                {"id": "M17", "sentences": ["We are friends. ___ friends.", "They are teachers. ___ teachers."], "answers": ["we're", "they're"]},
                {"id": "M18", "sentences": ["It is a pen. ___ a pen.", "It is not a ruler. It ___ a ruler."], "answers": ["it's", "isn't"]},
            ],
            fix: [
                {"id": "F19", "sentence": "I are Jim.", "wrongWord": "are", "answer": "am"},
                {"id": "F20", "sentence": "You is my teacher.", "wrongWord": "is", "answer": "are"},
                {"id": "F21", "sentence": "He are in the classroom.", "wrongWord": "are", "answer": "is"},
                {"id": "F22", "sentence": "We is in the playground.", "wrongWord": "is", "answer": "are"},
                {"id": "F23", "sentence": "They isn't my crayons.", "wrongWord": "isn't", "answer": "aren't"},
                {"id": "F24", "sentence": "This aren't my bag.", "wrongWord": "aren't", "answer": "isn't"},
            ],
        },
    };

    // PU1 Unit 2: approved family, body, have-got and senses boards.
    const pu1Unit2Catalogs = {
        19: {
            missing: [
                {"id": "M1", "sentences": ["Mr. Friendly is Jim's ___.", "Ms. Friendly is Jenny's ___."], "answers": ["father", "mother"], "prefixes": ["f", "m"]},
                {"id": "M2", "sentences": ["Jim is Jenny's ___.", "Jenny is Jim's ___."], "answers": ["brother", "sister"], "prefixes": ["b", "s"]},
                {"id": "M3", "sentences": ["Grandfather = ___.", "Grandmother = ___."], "answers": ["grandpa", "grandma"], "prefixes": ["g", "g"]},
                {"id": "M4", "sentences": ["Dad = ___.", "Mum = ___."], "answers": ["father", "mother"], "prefixes": ["f", "m"]},
            ],
            fix: [
                {"id": "F1", "sentence": "Mr. Friendly is Jim's mother.", "wrongWord": "mother", "answer": "father"},
                {"id": "F2", "sentence": "Ms. Friendly is Jenny's father.", "wrongWord": "father", "answer": "mother"},
                {"id": "F3", "sentence": "Jim is Jenny's sister.", "wrongWord": "sister", "answer": "brother"},
                {"id": "F4", "sentence": "Jenny is Jim's brother.", "wrongWord": "brother", "answer": "sister"},
            ],
        },
        20: {
            missing: [
                {"id": "M5", "sentences": ["This is Henrietta. She ___ Rocky's mother.", "Harry is Rocky's friend. He ___ Rocky's brother."], "answers": ["is", "isn't"]},
                {"id": "M6", "sentences": ["These animals ___ Rocky's family.", "Shelly ___ his friend."], "answers": ["aren't", "is"]},
            ],
            fix: [
                {"id": "F5", "sentence": "Henrietta is Rocky's father.", "wrongWord": "father", "answer": "mother"},
                {"id": "F6", "sentence": "Shelly isn't Rocky's friend.", "wrongWord": "isn't", "answer": "is"},
                {"id": "F7", "sentence": "Harry are Rocky's friend.", "wrongWord": "are", "answer": "is"},
                {"id": "F8", "sentence": "These animals isn't Rocky's family.", "wrongWord": "isn't", "answer": "aren't"},
            ],
        },
        21: {
            missing: [
                {"id": "M7", "sentences": ["Who ___ she? She's Jenny.", "___ he? He's Jim."], "answers": ["is", "who's"]},
                {"id": "M8", "sentences": ["This is Jim. ___ a boy.", "This is Jenny. ___ a girl."], "answers": ["he's", "she's"]},
                {"id": "M9", "sentences": ["___ is my brother, Jim.", "___ is my sister, Jenny."], "answers": ["he", "she"]},
                {"id": "M10", "sentences": ["Jim is a ___.", "Jenny is a ___."], "answers": ["boy", "girl"], "prefixes": ["b", "g"]},
            ],
            fix: [
                {"id": "F9", "sentence": "This is my mother. He's a woman.", "wrongWord": "he's", "answer": "she's"},
                {"id": "F10", "sentence": "This is my father. She's a man.", "wrongWord": "she's", "answer": "he's"},
                {"id": "F11", "sentence": "Who are she? She's Jenny.", "wrongWord": "are", "answer": "is"},
                {"id": "F12", "sentence": "This is my brother. They're a boy.", "wrongWord": "they're", "answer": "he's"},
            ],
        },
        22: {
            missing: [
                {"id": "M11", "sentences": ["I put a hat on my ___.", "I wear shoes on my ___."], "answers": ["head", "feet"], "prefixes": ["h", "f"]},
                {"id": "M12", "sentences": ["I clap my ___.", "I close my ___."], "answers": ["hands", "eyes"], "prefixes": ["h", "e"]},
                {"id": "M13", "sentences": ["I open my ___.", "I touch my ___."], "answers": ["mouth", "nose"], "prefixes": ["m", "n"]},
                {"id": "M14", "sentences": ["One foot. Two ___.", "One hand. Two ___."], "answers": ["feet", "hands"], "prefixes": ["f", "h"]},
                {"id": "M15", "sentences": ["One arm. Two ___.", "One leg. Two ___."], "answers": ["arms", "legs"], "prefixes": ["a", "l"]},
                {"id": "M16", "sentences": ["Cameron is a cat. He's got a ___.", "I've got brown ___."], "answers": ["tail", "hair"], "prefixes": ["t", "h"]},
            ],
            fix: [
                {"id": "F13", "sentence": "I wear shoes on my hands.", "wrongWord": "hands", "answer": "feet"},
                {"id": "F14", "sentence": "I've got two foot.", "wrongWord": "foot", "answer": "feet"},
                {"id": "F15", "sentence": "I've got one ears.", "wrongWord": "ears", "answer": "ear"},
                {"id": "F16", "sentence": "I've got two hand.", "wrongWord": "hand", "answer": "hands"},
                {"id": "F17", "sentence": "I've got two leg.", "wrongWord": "leg", "answer": "legs"},
                {"id": "F18", "sentence": "I've got one noses.", "wrongWord": "noses", "answer": "nose"},
                {"id": "F19", "sentence": "My eyes are on my feet.", "wrongWord": "feet", "answer": "face"},
                {"id": "F20", "sentence": "Cameron is a cat. He's got a ruler.", "wrongWord": "ruler", "answer": "tail"},
            ],
        },
        23: {
            missing: [
                {"id": "M17", "sentences": ["I've ___ brown hair.", "I ___ got a tail."], "answers": ["got", "haven't"]},
                {"id": "M18", "sentences": ["I ___ got two eyes.", "I ___ got four eyes."], "answers": ["have", "haven't"]},
                {"id": "M19", "sentences": ["___ you got a sister?", "___ he got a brother?"], "answers": ["have", "has"]},
                {"id": "M20", "sentences": ["I have got blue eyes. ___ got blue eyes.", "They have got brown hair. ___ got brown hair."], "answers": ["i've", "they've"]},
            ],
            fix: [
                {"id": "F21", "sentence": "I has got brown hair.", "wrongWord": "has", "answer": "have"},
                {"id": "F22", "sentence": "They has got blue eyes.", "wrongWord": "has", "answer": "have"},
                {"id": "F23", "sentence": "Have you get a brother?", "wrongWord": "get", "answer": "got"},
                {"id": "F24", "sentence": "Has she got two eye?", "wrongWord": "eye", "answer": "eyes"},
                {"id": "F25", "sentence": "I haven't get a tail.", "wrongWord": "get", "answer": "got"},
                {"id": "F26", "sentence": "The children hasn't got green hair.", "wrongWord": "hasn't", "answer": "haven't"},
            ],
        },
        26: {
            missing: [
                {"id": "M21", "sentences": ["I haven't got a tail. My sister ___ got a tail.", "I've got two hands. My brother ___ got two hands."], "answers": ["hasn't", "has"]},
                {"id": "M22", "sentences": ["We ___ got two feet.", "A cat ___ got four feet."], "answers": ["have", "has"]},
                {"id": "M23", "sentences": ["This is my brother. ___ a boy.", "These are my sisters. ___ girls."], "answers": ["he's", "they're"]},
                {"id": "M24", "sentences": ["My sister ___ got brown hair and blue ___.", "My brothers ___ got black hair and brown ___."], "answers": ["has", "eyes", "have", "eyes"], "prefixes": ["", "e", "", "e"]},
                {"id": "M25", "sentences": ["I ___ with my eyes.", "I ___ with my ears.", "I ___ things with my hands."], "answers": ["see", "hear", "touch"], "prefixes": ["s", "h", "t"]},
                {"id": "M26", "sentences": ["I ___ with my nose.", "I ___ food with my mouth."], "answers": ["smell", "taste"], "prefixes": ["s", "t"]},
            ],
            fix: [
                {"id": "F27", "sentence": "She have got long hair.", "wrongWord": "have", "answer": "has"},
                {"id": "F28", "sentence": "He haven't got a tail.", "wrongWord": "haven't", "answer": "hasn't"},
                {"id": "F29", "sentence": "We has got two feet.", "wrongWord": "has", "answer": "have"},
                {"id": "F30", "sentence": "The robot have got a blue head.", "wrongWord": "have", "answer": "has"},
                {"id": "F31", "sentence": "My brothers has got brown eyes.", "wrongWord": "has", "answer": "have"},
                {"id": "F32", "sentence": "My eyes is blue.", "wrongWord": "is", "answer": "are"},
                {"id": "F33", "sentence": "I see with my ears.", "wrongWord": "ears", "answer": "eyes"},
                {"id": "F34", "sentence": "I hear with my eyes.", "wrongWord": "eyes", "answer": "ears"},
                {"id": "F35", "sentence": "I smell with my feet.", "wrongWord": "feet", "answer": "nose"},
                {"id": "F36", "sentence": "I taste food with my ears.", "wrongWord": "ears", "answer": "mouth"},
            ],
        },
    };

    // PU1 Unit 3: approved farm animals, descriptions and animal products.
    const pu1Unit3Catalogs = {
        31: {
            missing: [
                {"id": "M1", "sentences": ["Harry is a ___.", "Cameron is a ___."], "answers": ["horse", "cat"], "prefixes": ["h", "c"]},
                {"id": "M2", "sentences": ["Gracie is a ___.", "Shelly is a ___."], "answers": ["goat", "sheep"], "prefixes": ["g", "s"]},
                {"id": "M3", "sentences": ["A ___ has got eight legs.", "A ___ says \"quack\"."], "answers": ["spider", "duck"], "prefixes": ["s", "d"]},
                {"id": "M4", "sentences": ["Henrietta is a ___.", "Rocky is a ___."], "answers": ["hen", "rooster"], "prefixes": ["h", "r"]},
            ],
            fix: [
                {"id": "F1", "sentence": "Harry is a cow.", "wrongWord": "cow", "answer": "horse"},
                {"id": "F2", "sentence": "Cameron is a dog.", "wrongWord": "dog", "answer": "cat"},
                {"id": "F3", "sentence": "Gracie is a sheep.", "wrongWord": "sheep", "answer": "goat"},
                {"id": "F4", "sentence": "Shelly is a goat.", "wrongWord": "goat", "answer": "sheep"},
            ],
        },
        32: {
            missing: [
                {"id": "M5", "sentences": ["Harry is ___.", "Rocky's spider is ___."], "answers": ["big", "small"], "prefixes": ["b", "s"]},
                {"id": "M6", "sentences": ["Gracie isn't young. She's ___.", "Rocky's brother and sister aren't old. They're ___."], "answers": ["old", "young"], "prefixes": ["o", "y"]},
            ],
            fix: [
                {"id": "F5", "sentence": "Harry is a small horse.", "wrongWord": "small", "answer": "big"},
                {"id": "F6", "sentence": "Gracie is young. She's an old goat.", "wrongWord": "young", "answer": "old"},
            ],
        },
        33: {
            missing: [
                {"id": "M7", "sentences": ["A horse ___ big.", "The horses ___ big."], "answers": ["is", "are"]},
                {"id": "M8", "sentences": ["This book isn't old. It's ___.", "This cat isn't old. It's ___."], "answers": ["new", "young"], "prefixes": ["n", "y"]},
                {"id": "M9", "sentences": ["The donkey has got ___ ears.", "The sheep has got a ___ tail."], "answers": ["long", "short"], "prefixes": ["l", "s"]},
                {"id": "M10", "sentences": ["It's ___ old cat.", "It's ___ young cat."], "answers": ["an", "a"]},
            ],
            fix: [
                {"id": "F7", "sentence": "It's an small spider.", "wrongWord": "an", "answer": "a"},
                {"id": "F8", "sentence": "It's a old cat.", "wrongWord": "a", "answer": "an"},
                {"id": "F9", "sentence": "The horses is big.", "wrongWord": "is", "answer": "are"},
                {"id": "F10", "sentence": "The donkey have got long ears.", "wrongWord": "have", "answer": "has"},
                {"id": "F11", "sentence": "It's a young cats.", "wrongWord": "cats", "answer": "cat"},
                {"id": "F12", "sentence": "They're small horse.", "wrongWord": "horse", "answer": "horses"},
            ],
        },
        34: {
            missing: [
                {"id": "M11", "sentences": ["The dog isn't sad. It's ___.", "The cat isn't happy. It's ___."], "answers": ["happy", "sad"], "prefixes": ["h", "s"]},
                {"id": "M12", "sentences": ["He's a ___ dog. He makes me laugh.", "It's an ___ cat. Don't touch it!"], "answers": ["funny", "angry"], "prefixes": ["f", "a"]},
                {"id": "M13", "sentences": ["The dog isn't ugly. It's ___.", "This spider isn't beautiful. It's ___."], "answers": ["beautiful", "ugly"], "prefixes": ["b", "u"]},
                {"id": "M14", "sentences": ["It's ___ angry cat.", "It's ___ happy dog."], "answers": ["an", "a"]},
            ],
            fix: [
                {"id": "F13", "sentence": "😊 It's a sad dog.", "wrongWord": "sad", "answer": "happy"},
                {"id": "F14", "sentence": "😠 It's a happy cat.", "wrongWord": "happy", "answer": "angry"},
                {"id": "F15", "sentence": "She's a angry cat.", "wrongWord": "a", "answer": "an"},
                {"id": "F16", "sentence": "He's an happy dog.", "wrongWord": "an", "answer": "a"},
            ],
        },
        35: {
            missing: [
                {"id": "M15", "sentences": ["My dog ___ got a long tail.", "My dogs ___ got long tails."], "answers": ["has", "have"]},
                {"id": "M16", "sentences": ["A donkey ___ got long ears.", "A donkey ___ got short ears."], "answers": ["has", "hasn't"]},
                {"id": "M17", "sentences": ["___ it got a long face?", "___ they got long ears?"], "answers": ["has", "have"]},
                {"id": "M18", "sentences": ["It has got a big body. ___ got a big body.", "It has not got small feet. It ___ got small feet."], "answers": ["it's", "hasn't"]},
            ],
            fix: [
                {"id": "F17", "sentence": "My dog have got a long tail.", "wrongWord": "have", "answer": "has"},
                {"id": "F18", "sentence": "My dogs has got long tails.", "wrongWord": "has", "answer": "have"},
                {"id": "F19", "sentence": "Has it get a long face?", "wrongWord": "get", "answer": "got"},
                {"id": "F20", "sentence": "Have it got long ears?", "wrongWord": "have", "answer": "has"},
                {"id": "F21", "sentence": "It haven't got small feet.", "wrongWord": "haven't", "answer": "hasn't"},
                {"id": "F22", "sentence": "My donkey has got two long ear.", "wrongWord": "ear", "answer": "ears"},
            ],
        },
        36: {
            missing: [
                {"id": "M19", "sentences": ["The ___ comes from cows.", "These ___ come from chickens."], "answers": ["milk", "eggs"], "prefixes": ["m", "e"]},
                {"id": "M20", "sentences": ["The ___ comes from bees.", "This ___ comes from sheep."], "answers": ["honey", "wool"], "prefixes": ["h", "w"]},
                {"id": "M21", "sentences": ["Milk ___ from cows.", "Eggs ___ from chickens."], "answers": ["comes", "come"]},
            ],
            fix: [
                {"id": "F23", "sentence": "Milk comes from bees.", "wrongWord": "bees", "answer": "cows"},
                {"id": "F24", "sentence": "Eggs come from cows.", "wrongWord": "cows", "answer": "chickens"},
                {"id": "F25", "sentence": "Honey comes from sheep.", "wrongWord": "sheep", "answer": "bees"},
                {"id": "F26", "sentence": "Wool comes from chickens.", "wrongWord": "chickens", "answer": "sheep"},
            ],
        },
        37: {
            missing: [
                {"id": "M22", "sentences": ["People use ___ to make clothes.", "We get wool from ___."], "answers": ["wool", "sheep"], "prefixes": ["w", "s"]},
                {"id": "M23", "sentences": ["An alpaca has got four ___.", "It's got ___ hair."], "answers": ["legs", "long"], "prefixes": ["l", "l"]},
                {"id": "M24", "sentences": ["Wool comes ___ sheep.", "Honey ___ from bees."], "answers": ["from", "comes"]},
            ],
            fix: [
                {"id": "F27", "sentence": "An alpaca has got two legs.", "wrongWord": "two", "answer": "four"},
                {"id": "F28", "sentence": "An alpaca has got short hair.", "wrongWord": "short", "answer": "long"},
                {"id": "F29", "sentence": "Honey comes in bees.", "wrongWord": "in", "answer": "from"},
                {"id": "F30", "sentence": "Eggs comes from chickens.", "wrongWord": "comes", "answer": "come"},
            ],
        },
        43: {
            missing: [
                {"id": "M25", "sentences": ["One sheep. Two ___.", "One cow. Two ___."], "answers": ["sheep", "cows"], "prefixes": ["s", "c"]},
                {"id": "M26", "sentences": ["It's a horse. ___ got a long tail.", "They're donkeys. ___ got long ears."], "answers": ["it's", "they've"]},
                {"id": "M27", "sentences": ["My dog is happy. It ___ sad.", "My dogs are young. They ___ old."], "answers": ["isn't", "aren't"]},
                {"id": "M28", "sentences": ["This is ___ old book.", "These ___ new books."], "answers": ["an", "are"]},
            ],
            fix: [
                {"id": "F31", "sentence": "One sheep. Two sheeps.", "wrongWord": "sheeps", "answer": "sheep"},
                {"id": "F32", "sentence": "The donkey has got four leg.", "wrongWord": "leg", "answer": "legs"},
                {"id": "F33", "sentence": "These is my cows.", "wrongWord": "is", "answer": "are"},
                {"id": "F34", "sentence": "This are my sheep.", "wrongWord": "are", "answer": "is"},
                {"id": "F35", "sentence": "My cats isn't old.", "wrongWord": "isn't", "answer": "aren't"},
                {"id": "F36", "sentence": "Milk come from cows.", "wrongWord": "come", "answer": "comes"},
            ],
        },
    };

    // PU1 Unit 4: approved food, likes/dislikes and polite request boards.
    const pu1Unit4Catalogs = {
        45: {
            missing: [
                {"id": "M1", "sentences": ["🍌 It's a ___.", "🍔 It's a ___."], "answers": ["banana", "burger"], "prefixes": ["b", "b"]},
                {"id": "M2", "sentences": ["🍞 This is ___.", "🍫 This is ___."], "answers": ["bread", "chocolate"], "prefixes": ["b", "c"]},
                {"id": "M3", "sentences": ["🎂 It's a ___.", "🥗 It's a ___."], "answers": ["cake", "salad"], "prefixes": ["c", "s"]},
                {"id": "M4", "sentences": ["We make ___ with lemons and water.", "I drink ___."], "answers": ["lemonade", "water"], "prefixes": ["l", "w"]},
                {"id": "M5", "sentences": ["🥭 It's a ___.", "🍗 This is ___."], "answers": ["mango", "chicken"], "prefixes": ["m", "c"]},
            ],
            fix: [
                {"id": "F1", "sentence": "🍌 It's a burger.", "wrongWord": "burger", "answer": "banana"},
                {"id": "F2", "sentence": "🍔 It's a banana.", "wrongWord": "banana", "answer": "burger"},
                {"id": "F3", "sentence": "🍞 This is chocolate.", "wrongWord": "chocolate", "answer": "bread"},
                {"id": "F4", "sentence": "🍫 This is bread.", "wrongWord": "bread", "answer": "chocolate"},
                {"id": "F5", "sentence": "💧 This is lemonade.", "wrongWord": "lemonade", "answer": "water"},
                {"id": "F6", "sentence": "🎂 It's a salad.", "wrongWord": "salad", "answer": "cake"},
            ],
        },
        47: {
            missing: [
                {"id": "M6", "sentences": ["I ___ chocolate.", "She ___ chocolate."], "answers": ["like", "likes"]},
                {"id": "M7", "sentences": ["We ___ bananas.", "He ___ bananas."], "answers": ["like", "likes"]},
                {"id": "M8", "sentences": ["They ___ mangoes.", "My sister ___ mangoes."], "answers": ["like", "likes"]},
                {"id": "M9", "sentences": ["___ you like bread?", "___ she like bread?"], "answers": ["do", "does"]},
                {"id": "M10", "sentences": ["What ___ they like?", "What ___ Harry like?"], "answers": ["do", "does"]},
                {"id": "M11", "sentences": ["👎 I ___ like chocolate.", "👎 He ___ like cake."], "answers": ["don't", "doesn't"]},
                {"id": "M12", "sentences": ["👎 They ___ like chicken.", "👎 She ___ like burgers."], "answers": ["don't", "doesn't"]},
            ],
            fix: [
                {"id": "F7", "sentence": "She like chocolate.", "wrongWord": "like", "answer": "likes"},
                {"id": "F8", "sentence": "I likes bananas.", "wrongWord": "likes", "answer": "like"},
                {"id": "F9", "sentence": "They likes bread.", "wrongWord": "likes", "answer": "like"},
                {"id": "F10", "sentence": "My brother like mangoes.", "wrongWord": "like", "answer": "likes"},
                {"id": "F11", "sentence": "Does you like chicken?", "wrongWord": "does", "answer": "do"},
                {"id": "F12", "sentence": "Do she like cake?", "wrongWord": "do", "answer": "does"},
                {"id": "F13", "sentence": "What do Harry like?", "wrongWord": "do", "answer": "does"},
                {"id": "F14", "sentence": "He don't like chocolate.", "wrongWord": "don't", "answer": "doesn't"},
                {"id": "F15", "sentence": "We doesn't like burgers.", "wrongWord": "doesn't", "answer": "don't"},
                {"id": "F16", "sentence": "She doesn't likes salad.", "wrongWord": "likes", "answer": "like"},
            ],
        },
        48: {
            missing: [
                {"id": "M13", "sentences": ["🍎 It's an ___.", "🍊 It's an ___."], "answers": ["apple", "orange"], "prefixes": ["a", "o"]},
                {"id": "M14", "sentences": ["🍇 These are ___.", "Apples and bananas are ___."], "answers": ["grapes", "fruit"], "prefixes": ["g", "f"]},
                {"id": "M15", "sentences": ["I drink orange ___.", "Chicken is ___."], "answers": ["juice", "meat"], "prefixes": ["j", "m"]},
                {"id": "M16", "sentences": ["🫘 These are ___.", "I eat two ___ and eggs for breakfast.", "These balls of meat are ___."], "answers": ["beans", "sausages", "meatballs"], "prefixes": ["b", "s", "m"]},
            ],
            fix: [
                {"id": "F17", "sentence": "🍎 It's an orange.", "wrongWord": "orange", "answer": "apple"},
                {"id": "F18", "sentence": "🍊 It's an apple.", "wrongWord": "apple", "answer": "orange"},
                {"id": "F19", "sentence": "🍇 These are beans.", "wrongWord": "beans", "answer": "grapes"},
                {"id": "F20", "sentence": "Apples and bananas are meat.", "wrongWord": "meat", "answer": "fruit"},
                {"id": "F21", "sentence": "I drink orange sausages.", "wrongWord": "sausages", "answer": "juice"},
                {"id": "F22", "sentence": "These are balls of meat. They're grapeballs.", "wrongWord": "grapeballs", "answer": "meatballs"},
            ],
        },
        54: {
            missing: [
                {"id": "M17", "sentences": ["Can I ___ some chocolate, please?", "Here you ___."], "answers": ["have", "are"]},
                {"id": "M18", "sentences": ["___ you like some cake?", "Yes, ___."], "answers": ["would", "please"], "prefixes": ["", "p"]},
                {"id": "M19", "sentences": ["No, ___ you.", "Can I have some water, ___?"], "answers": ["thank", "please"]},
                {"id": "M20", "sentences": ["It's ___ apple.", "It's ___ banana."], "answers": ["an", "a"]},
                {"id": "M22", "sentences": ["🧀 This is ___.", "🍅 It's a ___."], "answers": ["cheese", "tomato"], "prefixes": ["c", "t"]},
                {"id": "M24", "sentences": ["One onion. Two ___.", "One potato. Two ___."], "answers": ["onions", "potatoes"], "prefixes": ["o", "p"]},
            ],
            fix: [
                {"id": "F23", "sentence": "Can I has some chocolate, please?", "wrongWord": "has", "answer": "have"},
                {"id": "F24", "sentence": "Would you likes some cake?", "wrongWord": "likes", "answer": "like"},
                {"id": "F25", "sentence": "Here you is.", "wrongWord": "is", "answer": "are"},
                {"id": "F26", "sentence": "No, thanks you.", "wrongWord": "thanks", "answer": "thank"},
                {"id": "F27", "sentence": "It's a onion.", "wrongWord": "a", "answer": "an"},
                {"id": "F28", "sentence": "It's an banana.", "wrongWord": "an", "answer": "a"},
                {"id": "F29", "sentence": "🍟 We make these chips with chocolate.", "wrongWord": "chocolate", "answer": "potatoes"},
                {"id": "F30", "sentence": "I like cheese, but my sister don't like it.", "wrongWord": "don't", "answer": "doesn't"},
                {"id": "F31", "sentence": "My sisters likes pasta.", "wrongWord": "likes", "answer": "like"},
                {"id": "F32", "sentence": "My dad doesn't eats rice.", "wrongWord": "eats", "answer": "eat"},
            ],
        },
    };

    // PU1 Unit 5: approved toys, possession, birthday wishes and shapes.
    const pu1Unit5Catalogs = {
        57: {
            missing: [
                {"id": "M1", "sentences": ["I fly my ___ on a string in the wind.", "I ride my ___ to school."], "answers": ["kite", "bike"], "prefixes": ["k", "b"]},
                {"id": "M2", "sentences": ["We fly to Beijing in a ___.", "Dad drives his ___ to work."], "answers": ["plane", "car"], "prefixes": ["p", "c"]},
                {"id": "M3", "sentences": ["I kick my ___ to play football.", "My toy ___ has got a head, two arms and two legs."], "answers": ["ball", "robot"], "prefixes": ["b", "r"]},
                {"id": "M4", "sentences": ["Eva likes her pretty ___.", "The ___ ___ has got two windows."], "answers": ["doll", "doll", "house"], "prefixes": ["d", "d", "h"]},
                {"id": "M5", "sentences": ["It's my ___ today.", "This toy is my ___."], "answers": ["birthday", "present"], "prefixes": ["b", "p"]},
            ],
            fix: [
                {"id": "F1", "sentence": "I fly my plane on a string in the wind.", "wrongWord": "plane", "answer": "kite"},
                {"id": "F2", "sentence": "My car has got two wheels. I ride it to school.", "wrongWord": "car", "answer": "bike"},
                {"id": "F3", "sentence": "We fly to Beijing in a kite.", "wrongWord": "kite", "answer": "plane"},
                {"id": "F4", "sentence": "My toy ball has got a head, two arms and two legs.", "wrongWord": "ball", "answer": "robot"},
                {"id": "F5", "sentence": "I kick the robot to play football.", "wrongWord": "robot", "answer": "ball"},
                {"id": "F6", "sentence": "My bike has got four wheels and four doors.", "wrongWord": "bike", "answer": "car"},
            ],
        },
        59: {
            missing: [
                {"id": "M6", "sentences": ["I've got a kite. It's ___ kite.", "You've got a car. It's ___ car."], "answers": ["my", "your"]},
                {"id": "M7", "sentences": ["Jim has got a robot. ___ robot is grey.", "Jenny has got a doll. ___ doll is new."], "answers": ["his", "her"]},
                {"id": "M8", "sentences": ["We've got balls. They're ___ balls.", "They've got a bike. It's ___ bike."], "answers": ["our", "their"]},
                {"id": "M9", "sentences": ["Grandma and Grandpa have got a house. ___ house is yellow.", "Jim and I have got a ball. ___ ball is blue."], "answers": ["their", "our"]},
                {"id": "M10", "sentences": ["This is Jenny's car. It's ___ car.", "These are Jim's toys. They're ___ toys."], "answers": ["her", "his"]},
                {"id": "M11", "sentences": ["___ kite is this? It's Jim's.", "___ he? He's Jim."], "answers": ["whose", "who's"]},
                {"id": "M12", "sentences": ["This kite is for Jim. It's ___ kite.", "This doll is for Jenny. It's ___ doll."], "answers": ["jim's", "jenny's"]},
                {"id": "M13", "sentences": ["The cat has got a tail. ___ tail is long.", "___ a toy cat."], "answers": ["its", "it's"]},
            ],
            fix: [
                {"id": "F7", "sentence": "I've got a kite. It's me kite.", "wrongWord": "me", "answer": "my"},
                {"id": "F8", "sentence": "You've got a car. It's you car.", "wrongWord": "you", "answer": "your"},
                {"id": "F9", "sentence": "Jim has got a robot. Her robot is grey.", "wrongWord": "her", "answer": "his"},
                {"id": "F10", "sentence": "Jenny has got a doll. His doll is new.", "wrongWord": "his", "answer": "her"},
                {"id": "F11", "sentence": "We've got a ball. It's we ball.", "wrongWord": "we", "answer": "our"},
                {"id": "F12", "sentence": "They've got a bike. It's they bike.", "wrongWord": "they", "answer": "their"},
                {"id": "F13", "sentence": "This is Jenny's car. It's she car.", "wrongWord": "she", "answer": "her"},
                {"id": "F14", "sentence": "These are Jim's toys. They're he toys.", "wrongWord": "he", "answer": "his"},
                {"id": "F15", "sentence": "Who's kite is this? It's Jim's.", "wrongWord": "who's", "answer": "whose"},
                {"id": "F16", "sentence": "The cat has got a tail. It's tail is long.", "wrongWord": "it's", "answer": "its"},
            ],
        },
        60: {
            missing: [
                {"id": "M14", "sentences": ["I've got six ___ for my birthday party.", "My toy ___ can fly."], "answers": ["balloons", "helicopter"], "prefixes": ["ballo", "heli"]},
                {"id": "M15", "sentences": ["My ___ has got a keyboard and a ___."], "answers": ["computer", "mouse"], "prefixes": ["c", "m"]},
                {"id": "M16", "sentences": ["My computer has got a ___ with lots of letters.", "I listen to music on my ___."], "answers": ["keyboard", "radio"], "prefixes": ["k", "r"]},
                {"id": "M17", "sentences": ["I take my soft ___ ___ to bed.", "I put my toys in a toy ___."], "answers": ["teddy", "bear", "box"], "prefixes": ["t", "b", "b"]},
                {"id": "M18", "sentences": ["We play a board ___.", "The toy ___ is on the water."], "answers": ["game", "ship"], "prefixes": ["g", "s"]},
            ],
            fix: [
                {"id": "F17", "sentence": "I've got six balloon for my birthday party.", "wrongWord": "balloon", "answer": "balloons"},
                {"id": "F18", "sentence": "I've got two helicopter.", "wrongWord": "helicopter", "answer": "helicopters"},
                {"id": "F19", "sentence": "My teddy cat is a soft toy with small round ears.", "wrongWord": "cat", "answer": "bear"},
                {"id": "F20", "sentence": "I put my toys in my toy bread.", "wrongWord": "bread", "answer": "box"},
                {"id": "F21", "sentence": "My computer has got a cheese and a mouse.", "wrongWord": "cheese", "answer": "keyboard"},
                {"id": "F22", "sentence": "We play a board cake.", "wrongWord": "cake", "answer": "game"},
            ],
        },
        61: {
            missing: [
                {"id": "M19", "sentences": ["I ___ a robot for ___ birthday.", "He ___ a robot for ___ birthday."], "answers": ["want", "my", "wants", "his"], "prefixes": ["w", "m", "w", "h"]},
                {"id": "M20", "sentences": ["We ___ kites for ___ birthdays.", "She ___ a kite for ___ birthday."], "answers": ["want", "our", "wants", "her"], "prefixes": ["w", "o", "w", "h"]},
                {"id": "M21", "sentences": ["They ___ some balloons for ___ birthdays.", "My brother ___ a plane for ___ birthday."], "answers": ["want", "their", "wants", "his"], "prefixes": ["w", "t", "w", "h"]},
                {"id": "M22", "sentences": ["___ you want a teddy?", "___ she want a robot?"], "answers": ["do", "does"]},
                {"id": "M23", "sentences": ["What ___ they want?", "What ___ he want?"], "answers": ["do", "does"]},
                {"id": "M24", "sentences": ["👎 I ___ want a car.", "👎 He ___ want a doll."], "answers": ["don't", "doesn't"]},
            ],
            fix: [
                {"id": "F23", "sentence": "He want a helicopter.", "wrongWord": "want", "answer": "wants"},
                {"id": "F24", "sentence": "I wants a robot.", "wrongWord": "wants", "answer": "want"},
                {"id": "F25", "sentence": "My sister want a doll.", "wrongWord": "want", "answer": "wants"},
                {"id": "F26", "sentence": "They wants some balloons.", "wrongWord": "wants", "answer": "want"},
                {"id": "F27", "sentence": "Do he want a teddy?", "wrongWord": "do", "answer": "does"},
                {"id": "F28", "sentence": "Does you want a plane?", "wrongWord": "does", "answer": "do"},
                {"id": "F29", "sentence": "He don't want a car.", "wrongWord": "don't", "answer": "doesn't"},
                {"id": "F30", "sentence": "She doesn't wants a kite.", "wrongWord": "wants", "answer": "want"},
            ],
        },
        63: {
            missing: [
                {"id": "M25", "sentences": ["The wheels on my bike are two ___.", "A ___ has got four sides."], "answers": ["circles", "square"], "prefixes": ["c", "s"]},
                {"id": "M26", "sentences": ["A ___ has got three sides.", "A ___ has got two long sides and two short sides."], "answers": ["triangle", "rectangle"], "prefixes": ["t", "r"]},
                {"id": "M27", "sentences": ["A triangle has got ___ sides.", "A square has got ___ sides."], "answers": ["three", "four"], "prefixes": ["t", "f"]},
                {"id": "M28", "sentences": ["One circle. Two ___.", "One rectangle. Two ___."], "answers": ["circles", "rectangles"], "prefixes": ["c", "r"]},
            ],
            fix: [
                {"id": "F31", "sentence": "The wheels on my bike are squares.", "wrongWord": "squares", "answer": "circles"},
                {"id": "F32", "sentence": "A triangle has got four equal sides.", "wrongWord": "triangle", "answer": "square"},
                {"id": "F33", "sentence": "A rectangle has got three sides.", "wrongWord": "rectangle", "answer": "triangle"},
                {"id": "F34", "sentence": "A circle has got two long sides and two short sides.", "wrongWord": "circle", "answer": "rectangle"},
                {"id": "F35", "sentence": "A triangle has got four sides.", "wrongWord": "four", "answer": "three"},
                {"id": "F36", "sentence": "I've got two rectangle.", "wrongWord": "rectangle", "answer": "rectangles"},
            ],
        },
    };

    // PU1 Unit 6: approved transport, animals, there-forms and mixed review.
    const pu1Unit6Catalogs = {
        78: {
            missing: [
                {"id": "M1", "sentences": ["We wait at the ___ ___.", "Then we get on the ___."], "answers": ["bus", "stop", "bus"], "prefixes": ["b", "s", "b"]},
                {"id": "M2", "sentences": ["We buy books at the ___.", "We buy toys at the toy ___."], "answers": ["bookshop", "shop"], "prefixes": ["b", "s"]},
                {"id": "M3", "sentences": ["There are flowers in our ___.", "We play in the ___ after school."], "answers": ["garden", "park"], "prefixes": ["g", "p"]},
                {"id": "M4", "sentences": ["We can go to Beijing by plane or by ___.", "I go to school in my mum's ___."], "answers": ["train", "car"], "prefixes": ["tr", "c"]},
                {"id": "M5", "sentences": ["A ___ has got two wheels.", "This big ___ has got six wheels."], "answers": ["motorbike", "lorry"], "prefixes": ["motor", "lor"]},
                {"id": "M6", "sentences": ["This brown ___ is very tall.", "There are red and yellow ___ in the garden."], "answers": ["tree", "flowers"], "prefixes": ["tr", "fl"]},
                {"id": "M7", "sentences": ["There ___ a bus in the street.", "There ___ two cars in the street."], "answers": ["is", "are"]},
                {"id": "M8", "sentences": ["There ___ three monkeys in the tree.", "There ___ a tiger at the zoo."], "answers": ["are", "is"]},
                {"id": "M9", "sentences": ["___ there a bookshop in your town?", "___ there any shops in your town?"], "answers": ["is", "are"]},
                {"id": "M10", "sentences": ["There aren't ___ trains.", "Are there ___ motorbikes?"], "answers": ["any", "any"]},
                {"id": "M11", "sentences": ["There ___ any cars in the garden.", "There ___ a bus in the classroom."], "answers": ["aren't", "isn't"]},
                {"id": "M12", "sentences": ["There ___ any buses in the classroom.", "There ___ two lorries in the street."], "answers": ["aren't", "are"]},
                {"id": "M13", "sentences": ["Is there a train? No, there ___.", "Are there any buses? No, there ___."], "answers": ["isn't", "aren't"]},
                {"id": "M14", "sentences": ["Is there a garden? Yes, there ___.", "Are there any flowers? Yes, there ___."], "answers": ["is", "are"]},
                {"id": "M15", "sentences": ["A ___ has got a very long neck.", "A ___ hasn't got any legs."], "answers": ["giraffe", "snake"], "prefixes": ["g", "s"]},
                {"id": "M16", "sentences": ["An ___ is big and grey.", "A ___ is black and white."], "answers": ["elephant", "zebra"], "prefixes": ["e", "z"]},
                {"id": "M17", "sentences": ["A ___ ___ is a big white animal.", "A ___ is a big orange and black cat."], "answers": ["polar", "bear", "tiger"], "prefixes": ["p", "b", "t"]},
                {"id": "M18", "sentences": ["A ___ can climb trees.", "A ___ has got a long tail and a big mouth."], "answers": ["monkey", "crocodile"], "prefixes": ["mon", "croc"]},
                {"id": "M19", "sentences": ["A ___ is a black and white bird.", "A ___ is a pink bird with long legs."], "answers": ["penguin", "flamingo"], "prefixes": ["pen", "fla"]},
                {"id": "M20", "sentences": ["A ___ is a big animal. It likes water.", "A ___ is a big cat with long hair."], "answers": ["hippo", "lion"], "prefixes": ["hi", "li"]},
                {"id": "M21", "sentences": ["A ___ is a black and white bear.", "My pet ___ has got four short legs and a long tail."], "answers": ["panda", "lizard"], "prefixes": ["pa", "liz"]},
                {"id": "M22", "sentences": ["A ___ is a big grey animal.", "A ___ can jump and swim."], "answers": ["rhino", "frog"], "prefixes": ["rhi", "fr"]},
                {"id": "M23", "sentences": ["Let's ___ a game.", "Let's ___ a picture."], "answers": ["play", "draw"], "prefixes": ["p", "d"]},
                {"id": "M24", "sentences": ["___ look at the zebras.", "That's a good ___."], "answers": ["let's", "idea"], "prefixes": ["l", "i"]},
                {"id": "M31", "sentences": ["___ are two zebras at the zoo.", "___ black and white.", "___ legs are long."], "answers": ["there", "they're", "their"]},
                {"id": "M32", "sentences": ["The children have got a ball. It's ___ ball.", "___ in the park.", "___ is a tree in the park."], "answers": ["their", "they're", "there"]},
                {"id": "M33", "sentences": ["___ are three cars in the street.", "___ red.", "___ doors are black."], "answers": ["there", "they're", "their"]},
                {"id": "M34", "sentences": ["Jim and Jenny have got a garden.", "___ garden has got lots of flowers.", "___ are two trees in it.", "___ very tall."], "answers": ["their", "there", "they're"]},
            ],
            fix: [
                {"id": "F1", "sentence": "We wait for the bus at the bus shop.", "wrongWord": "shop", "answer": "stop"},
                {"id": "F2", "sentence": "We buy books at the bookstop.", "wrongWord": "bookstop", "answer": "bookshop"},
                {"id": "F3", "sentence": "There are lots of flowers in our keyboard.", "wrongWord": "keyboard", "answer": "garden"},
                {"id": "F4", "sentence": "We play football in the train.", "wrongWord": "train", "answer": "park"},
                {"id": "F5", "sentence": "There are two lorry in the street.", "wrongWord": "lorry", "answer": "lorries"},
                {"id": "F6", "sentence": "There are three bus in the street.", "wrongWord": "bus", "answer": "buses"},
                {"id": "F7", "sentence": "There are a car in the street.", "wrongWord": "are", "answer": "is"},
                {"id": "F8", "sentence": "There is two lorries in the park.", "wrongWord": "is", "answer": "are"},
                {"id": "F9", "sentence": "There aren't a train in the park.", "wrongWord": "aren't", "answer": "isn't"},
                {"id": "F10", "sentence": "There isn't any shops in my town.", "wrongWord": "isn't", "answer": "aren't"},
                {"id": "F11", "sentence": "Is there any trees in the garden?", "wrongWord": "is", "answer": "are"},
                {"id": "F12", "sentence": "Are there a zoo in your town?", "wrongWord": "are", "answer": "is"},
                {"id": "F13", "sentence": "There are any flowers in the garden.", "wrongWord": "any", "answer": "some"},
                {"id": "F14", "sentence": "There aren't a monkeys in the tree.", "wrongWord": "a", "answer": "any"},
                {"id": "F15", "sentence": "There is a elephant at the zoo.", "wrongWord": "a", "answer": "an"},
                {"id": "F16", "sentence": "There are two crocodile in the water.", "wrongWord": "crocodile", "answer": "crocodiles"},
                {"id": "F17", "sentence": "A zebra has got a very long neck.", "wrongWord": "zebra", "answer": "giraffe"},
                {"id": "F18", "sentence": "A giraffe is a long animal with no legs.", "wrongWord": "giraffe", "answer": "snake"},
                {"id": "F19", "sentence": "The elephant is a big green animal.", "wrongWord": "green", "answer": "grey"},
                {"id": "F20", "sentence": "A zebra is black and pink.", "wrongWord": "pink", "answer": "white"},
                {"id": "F21", "sentence": "A polar bear is a big black animal. It lives on the ice.", "wrongWord": "black", "answer": "white"},
                {"id": "F22", "sentence": "Tigers eat bread. They're big cats.", "wrongWord": "bread", "answer": "meat"},
                {"id": "F23", "sentence": "A flamingo is a blue bird with long legs.", "wrongWord": "blue", "answer": "pink"},
                {"id": "F24", "sentence": "A snake has got four legs.", "wrongWord": "four", "answer": "no"},
                {"id": "F27", "sentence": "A panda is black and green.", "wrongWord": "green", "answer": "white"},
                {"id": "F28", "sentence": "A frog has got eight legs.", "wrongWord": "eight", "answer": "four"},
                {"id": "F29", "sentence": "A lizard has got six legs.", "wrongWord": "six", "answer": "four"},
                {"id": "F30", "sentence": "A penguin can fly.", "wrongWord": "can", "answer": "can't"},
                {"id": "F31", "sentence": "Let's playing a game.", "wrongWord": "playing", "answer": "play"},
                {"id": "F32", "sentence": "Let's looking at the zebras.", "wrongWord": "looking", "answer": "look"},
                {"id": "F33", "sentence": "Let's colour the elephants grey. That's a good egg.", "wrongWord": "egg", "answer": "idea"},
                {"id": "F34", "sentence": "Let's draws a picture.", "wrongWord": "draws", "answer": "draw"},
                {"id": "F41", "sentence": "Their are two elephants at the zoo.", "wrongWord": "their", "answer": "there"},
                {"id": "F42", "sentence": "They're is a bus in the street.", "wrongWord": "they're", "answer": "there"},
                {"id": "F43", "sentence": "The zebras are black and white. There very big.", "wrongWord": "there", "answer": "they're"},
                {"id": "F44", "sentence": "The children are in the park. Their happy.", "wrongWord": "their", "answer": "they're"},
                {"id": "F45", "sentence": "Jim and Jenny have got a bike. It's they're bike.", "wrongWord": "they're", "answer": "their"},
                {"id": "F46", "sentence": "The giraffes are tall. There necks are long.", "wrongWord": "there", "answer": "their"},
                {"id": "F47", "sentence": "Look at the monkeys. Their in the tree.", "wrongWord": "their", "answer": "they're"},
                {"id": "F48", "sentence": "They're are three flowers in the garden.", "wrongWord": "they're", "answer": "there"},
            ],
        },
        81: {
            missing: [
                {"id": "M27", "sentences": ["I've got a robot. It's ___ robot.", "She's got a doll. It's ___ doll."], "answers": ["my", "her"]},
                {"id": "M28", "sentences": ["My brother ___ bananas.", "My sisters ___ mangoes."], "answers": ["likes", "like"], "prefixes": ["l", "l"]},
                {"id": "M29", "sentences": ["He ___ a robot for his birthday.", "They ___ a board game for their birthday."], "answers": ["wants", "want"], "prefixes": ["w", "w"]},
                {"id": "M30", "sentences": ["___ I have some water, please?", "Here you ___."], "answers": ["can", "are"]},
            ],
            fix: [
                {"id": "F35", "sentence": "My sister like bananas.", "wrongWord": "like", "answer": "likes"},
                {"id": "F36", "sentence": "They likes chocolate.", "wrongWord": "likes", "answer": "like"},
                {"id": "F37", "sentence": "He want a robot for his birthday.", "wrongWord": "want", "answer": "wants"},
                {"id": "F38", "sentence": "Do she want a teddy?", "wrongWord": "do", "answer": "does"},
                {"id": "F39", "sentence": "This is Jenny's bike. It's his bike.", "wrongWord": "his", "answer": "her"},
                {"id": "F40", "sentence": "Can I has some water, please?", "wrongWord": "has", "answer": "have"},
            ],
        },
    };

    // PU1 Unit 7: approved sports, present continuous and permission boards.
    const pu1Unit7Catalogs = {
        83: {
            missing: [
                {"id": "M1", "sentences": ["We play ___ with a big ball and our feet.", "We play ___ with a big orange ball."], "answers": ["football", "basketball"], "prefixes": ["f", "b"]},
                {"id": "M2", "sentences": ["I play ___ with a small yellow ball.", "I ride my ___ to school."], "answers": ["tennis", "bike"], "prefixes": ["t", "b"]},
                {"id": "M3", "sentences": ["I can play ___ on the ___ or on a ___."], "answers": ["music", "piano", "guitar"], "prefixes": ["m", "p", "g"]},
                {"id": "M4", "sentences": ["After school, I like watching ___ or going for a ___ in the ___ pool."], "answers": ["tv", "swim", "swimming"], "prefixes": ["", "s", ""], "suffixes": ["", "", "ming"]},
                {"id": "M5", "sentences": ["I ___ ___ play tennis.", "He ___ ___ ride a bike."], "answers": ["want", "to", "wants", "to"], "prefixes": ["w", "", "w", ""]},
                {"id": "M6", "sentences": ["We want to ___ football.", "I want to ___ a bike."], "answers": ["play", "ride"], "prefixes": ["p", "r"]},
                {"id": "M7", "sentences": ["Let's ___ the guitar.", "Let's ___ television."], "answers": ["play", "watch"], "prefixes": ["p", "w"]},
                {"id": "M8", "sentences": ["I play ___ piano.", "Football ___ my favourite sport."], "answers": ["the", "is"]},
            ],
            fix: [
                {"id": "F1", "sentence": "I ride football with my friends.", "wrongWord": "ride", "answer": "play"},
                {"id": "F2", "sentence": "I play my bike to school.", "wrongWord": "play", "answer": "ride"},
                {"id": "F3", "sentence": "Let's listen television.", "wrongWord": "listen", "answer": "watch"},
                {"id": "F4", "sentence": "I want for play tennis.", "wrongWord": "for", "answer": "to"},
                {"id": "F5", "sentence": "She want to play the piano.", "wrongWord": "want", "answer": "wants"},
                {"id": "F6", "sentence": "Let's plays basketball.", "wrongWord": "plays", "answer": "play"},
                {"id": "F7", "sentence": "I play at guitar.", "wrongWord": "at", "answer": "the"},
                {"id": "F8", "sentence": "I wants to swim.", "wrongWord": "wants", "answer": "want"},
            ],
        },
        84: {
            missing: [
                {"id": "M9", "sentences": ["I ___ watching television.", "She ___ playing tennis."], "answers": ["am", "is"]},
                {"id": "M10", "sentences": ["You ___ riding a bike.", "My brother ___ swimming."], "answers": ["are", "is"]},
                {"id": "M11", "sentences": ["We ___ playing football.", "I ___ eating an apple."], "answers": ["are", "am"]},
                {"id": "M12", "sentences": ["What ___ she doing?", "What ___ they doing?"], "answers": ["is", "are"]},
                {"id": "M13", "sentences": ["___ he playing tennis?", "___ you watching television?"], "answers": ["is", "are"]},
                {"id": "M14", "sentences": ["I'm ___ a picture.", "She's ___ her feet."], "answers": ["painting", "cleaning"], "prefixes": ["p", "c"]},
                {"id": "M15", "sentences": ["I'm ___ a bike.", "They're ___ in the water."], "answers": ["riding", "swimming"], "prefixes": ["r", "sw"]},
                {"id": "M16", "sentences": ["Are you swimming? No, I'm ___.", "Is she playing tennis? No, she ___."], "answers": ["not", "isn't"]},
            ],
            fix: [
                {"id": "F9", "sentence": "I is watching television.", "wrongWord": "is", "answer": "am"},
                {"id": "F10", "sentence": "She are playing tennis.", "wrongWord": "are", "answer": "is"},
                {"id": "F11", "sentence": "They is riding their bikes.", "wrongWord": "is", "answer": "are"},
                {"id": "F12", "sentence": "We am watching television.", "wrongWord": "am", "answer": "are"},
                {"id": "F13", "sentence": "What is she do?", "wrongWord": "do", "answer": "doing"},
                {"id": "F14", "sentence": "What are he doing?", "wrongWord": "are", "answer": "is"},
                {"id": "F15", "sentence": "Is you playing football?", "wrongWord": "is", "answer": "are"},
                {"id": "F16", "sentence": "I'm play tennis.", "wrongWord": "play", "answer": "playing"},
                {"id": "F17", "sentence": "She's ride a bike.", "wrongWord": "ride", "answer": "riding"},
                {"id": "F18", "sentence": "They're swiming.", "wrongWord": "swiming", "answer": "swimming"},
                {"id": "F19", "sentence": "I'm not eat an apple.", "wrongWord": "eat", "answer": "eating"},
                {"id": "F20", "sentence": "They isn't watching television.", "wrongWord": "isn't", "answer": "aren't"},
            ],
        },
        92: {
            missing: [
                {"id": "M17", "sentences": ["We use a bat and a small ball to play ___.", "We use a stick and a ball to play ___."], "answers": ["baseball", "hockey"], "prefixes": ["b", "h"]},
                {"id": "M18", "sentences": ["I play ___ with my sister.", "We use a ___ to hit the ball in tennis."], "answers": ["badminton", "racket"], "prefixes": ["bad", "r"]},
                {"id": "M19", "sentences": ["He's ___ the football with his foot.", "She's ___ the tennis ball with her racket."], "answers": ["kicking", "hitting"], "prefixes": ["k", "h"]},
                {"id": "M20", "sentences": ["He's ___ the ball to me.", "I'm ___ it with my hands."], "answers": ["throwing", "catching"], "prefixes": ["th", "cat"]},
                {"id": "M21", "sentences": ["She's ___ in the park.", "He's ___ in the park."], "answers": ["running", "skateboarding"], "prefixes": ["run", "skate"]},
                {"id": "M22", "sentences": ["I can ___ a bike.", "I'm ___ a bike now."], "answers": ["ride", "riding"], "prefixes": ["r", "r"]},
                {"id": "M23", "sentences": ["We want to ___ in the water.", "We're ___ now."], "answers": ["swim", "swimming"], "prefixes": ["s", "sw"]},
                {"id": "M24", "sentences": ["Let's ___ football.", "They're ___ football now."], "answers": ["play", "playing"], "prefixes": ["p", "p"]},
                {"id": "M25", "sentences": ["Can I ___ television, please?", "Dad is ___ television."], "answers": ["watch", "watching"], "prefixes": ["w", "w"]},
                {"id": "M26", "sentences": ["___ we play in the park, Mum?", "Yes, you ___, but you ___ play in the road."], "answers": ["can", "can", "can't"]},
                {"id": "M27", "sentences": ["She's playing ___ guitar.", "We're listening ___ music."], "answers": ["the", "to"]},
                {"id": "M28", "sentences": ["___ are two boys in the park.", "___ playing football.", "___ ball is red."], "answers": ["there", "they're", "their"]},
            ],
            fix: [
                {"id": "F21", "sentence": "We play baseball with a banana.", "wrongWord": "banana", "answer": "bat"},
                {"id": "F22", "sentence": "We play hockey with a guitar.", "wrongWord": "guitar", "answer": "stick"},
                {"id": "F23", "sentence": "We use a tennis rabbit to play tennis.", "wrongWord": "rabbit", "answer": "racket"},
                {"id": "F24", "sentence": "He's kicking the tennis ball with his racket.", "wrongWord": "kicking", "answer": "hitting"},
                {"id": "F25", "sentence": "She's hiting the ball.", "wrongWord": "hiting", "answer": "hitting"},
                {"id": "F26", "sentence": "They're runing in the park.", "wrongWord": "runing", "answer": "running"},
                {"id": "F27", "sentence": "I can riding a bike.", "wrongWord": "riding", "answer": "ride"},
                {"id": "F28", "sentence": "I want to swimming.", "wrongWord": "swimming", "answer": "swim"},
                {"id": "F29", "sentence": "Let's playing hockey.", "wrongWord": "playing", "answer": "play"},
                {"id": "F30", "sentence": "Can we watching television, please?", "wrongWord": "watching", "answer": "watch"},
                {"id": "F31", "sentence": "She's smileing.", "wrongWord": "smileing", "answer": "smiling"},
                {"id": "F32", "sentence": "We are listen to music.", "wrongWord": "listen", "answer": "listening"},
                {"id": "F33", "sentence": "She's playing to guitar.", "wrongWord": "to", "answer": "the"},
                {"id": "F34", "sentence": "Dad is listening the music.", "wrongWord": "the", "answer": "to"},
                {"id": "F35", "sentence": "Their playing basketball in the park.", "wrongWord": "their", "answer": "they're"},
                {"id": "F36", "sentence": "The children are playing tennis. They're rackets are new.", "wrongWord": "they're", "answer": "their"},
            ],
        },
    };

    const pageCatalogs = { 'PU1:7:83': pu1Unit7Catalogs[83], 'PU1:7:84': pu1Unit7Catalogs[84], 'PU1:7:92': pu1Unit7Catalogs[92], 'PU1:6:78': pu1Unit6Catalogs[78], 'PU1:6:81': pu1Unit6Catalogs[81], 'PU1:5:57': pu1Unit5Catalogs[57], 'PU1:5:59': pu1Unit5Catalogs[59], 'PU1:5:60': pu1Unit5Catalogs[60], 'PU1:5:61': pu1Unit5Catalogs[61], 'PU1:5:63': pu1Unit5Catalogs[63], 'PU1:4:45': pu1Unit4Catalogs[45], 'PU1:4:47': pu1Unit4Catalogs[47], 'PU1:4:48': pu1Unit4Catalogs[48], 'PU1:4:54': pu1Unit4Catalogs[54], 'PU1:3:31': pu1Unit3Catalogs[31], 'PU1:3:32': pu1Unit3Catalogs[32], 'PU1:3:33': pu1Unit3Catalogs[33], 'PU1:3:34': pu1Unit3Catalogs[34], 'PU1:3:35': pu1Unit3Catalogs[35], 'PU1:3:36': pu1Unit3Catalogs[36], 'PU1:3:37': pu1Unit3Catalogs[37], 'PU1:3:43': pu1Unit3Catalogs[43], 'PU1:2:19': pu1Unit2Catalogs[19], 'PU1:2:20': pu1Unit2Catalogs[20], 'PU1:2:21': pu1Unit2Catalogs[21], 'PU1:2:22': pu1Unit2Catalogs[22], 'PU1:2:23': pu1Unit2Catalogs[23], 'PU1:2:26': pu1Unit2Catalogs[26], 'PU1:0:5': pu1Unit0Catalogs[5], 'PU1:0:7': pu1Unit0Catalogs[7], 'PU1:0:8': pu1Unit0Catalogs[8], 'PU1:1:9': pu1Unit1Catalogs[9], 'PU1:1:10': pu1Unit1Catalogs[10], 'PU1:1:11': pu1Unit1Catalogs[11], 'PU1:1:12': pu1Unit1Catalogs[12], 'PU1:1:13': pu1Unit1Catalogs[13], 'PU1:1:16': pu1Unit1Catalogs[16], 'PU2:9:107': pu2Unit9Catalogs[107], 'PU2:9:109': pu2Unit9Catalogs[109], 'PU2:9:116': pu2Unit9Catalogs[116], 'PU2:9:119': pu2Unit9Catalogs[119], 'PU2:8:95': pu2Unit8Catalogs[95], 'PU2:8:96': pu2Unit8Catalogs[96], 'PU2:8:97': pu2Unit8Catalogs[97], 'PU2:8:98': pu2Unit8Catalogs[98], 'PU2:8:104': pu2Unit8Catalogs[104], 'PU2:7:83': pu2Unit7Catalogs[83], 'PU2:7:85': pu2Unit7Catalogs[85], 'PU2:7:87': pu2Unit7Catalogs[87], 'PU2:6:78': pu2Unit6Catalogs[78], 'PU2:6:81': pu2Unit6Catalogs[81], 'PU2:5:57': pu2Unit5Catalogs[57], 'PU2:5:60': pu2Unit5Catalogs[60], 'PU2:5:62': pu2Unit5Catalogs[62], 'PU2:4:45': pu2Unit4Catalogs[45], 'PU2:4:46': pu2Unit4Catalogs[46], 'PU2:4:47': pu2Unit4Catalogs[47], 'PU2:4:54': pu2Unit4Catalogs[54], 'PU2:3:31': pu2Unit3Catalogs[31], 'PU2:3:33': pu2Unit3Catalogs[33], 'PU2:3:40': pu2Unit3Catalogs[40], 'PU2:2:19': pu2Unit2Catalogs[19], 'PU2:2:21': pu2Unit2Catalogs[21], 'PU2:2:22': pu2Unit2Catalogs[22], 'PU2:2:25': pu2Unit2Catalogs[25], 'PU2:1:7': pu2Unit1Catalogs[7], 'PU2:1:9': pu2Unit1Catalogs[9], 'PU2:1:10': pu2Unit1Catalogs[10], 'PU2:1:16': pu2Unit1Catalogs[16], 'PU3:1:16': unit1Catalog, 'PU3:2:28': unit2Catalog, 'PU3:3:40': unit3Catalog, 'PU3:4:54': unit4Catalog, 'PU3:5:57': unit5Catalogs[57], 'PU3:5:59': unit5Catalogs[59], 'PU3:5:66': unit5Catalogs[66], 'PU3:6:69': unit6Catalogs[69], 'PU3:6:71': unit6Catalogs[71], 'PU3:6:73': unit6Catalogs[73], 'PU3:7:83': unit7Catalogs[83], 'PU3:7:85': unit7Catalogs[85], 'PU3:7:87': unit7Catalogs[87], 'PU3:8:95': unit8Catalogs[95], 'PU3:8:97': unit8Catalogs[97], 'PU3:8:98': unit8Catalogs[98], 'PU3:8:99': unit8Catalogs[99], 'PU3:9:107': unit9Catalogs[107], 'PU3:9:109': catalog, 'PU3:9:110': unit9Catalogs[110], 'PU3:9:111': unit9Catalogs[111] };

    function normalize() {
        if (typeof TEACHING_CONTENT === 'undefined') return;
        for (const book of Object.keys(TEACHING_CONTENT)) {
            for (const unit of Object.keys(TEACHING_CONTENT[book])) {
                for (const page of Object.keys(TEACHING_CONTENT[book][unit])) {
                    const content = TEACHING_CONTENT[book][unit][page];
                    if (Array.isArray(content.nonSpellingExercises)) continue;
                    // Retain the legacy arrays for existing readers and SR identities.
                    content.nonSpellingExercises = [
                        ...(content.sentences || []).map(sentence => ({ type: 'sentence-scramble', sentence })),
                        ...((content.sentencePairs || []).length ? [{ type: 'sentence-match', pairs: content.sentencePairs }] : [])
                    ];
                    const authored = pageCatalogs[[book, unit, page].join(':')];
                    if (authored) {
                        content.nonSpellingExercises.push(
                            ...authored.missing.map(item => ({ ...item, type: 'missing-word' })),
                            ...authored.fix.map(item => ({ ...item, type: 'find-fix' }))
                        );
                    }
                }
            }
        }
    }

    function typedKey(item, page) {
        return ['non-spelling', item.type, page.book, page.unit, page.page, item.id].join(':').toLowerCase();
    }

    function buildPool(book, unit, page, options = {}) {
        normalize();
        const pages = getSortedPagesForBook(book);
        const activeIndex = pages.findIndex(p => p.book === book && String(p.unit) === String(unit) && String(p.page) === String(page));
        if (activeIndex < 0) return { entries: [], activeIndex };
        const state = options.srState || (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.srState) || {};
        const session = options.session === undefined ? getCurrentSession() : options.session;
        const seen = new Set();
        const seenPairs = new Set();
        const entries = [];
        const priority = (key, bucket) => getSRPriority(key, state[bucket] || {}, session, options.failures, options.successes);
        const add = (item, p, key, bucket, status, varietyEligible = true) => {
            const identity = item.type + ':' + key;
            if (seen.has(identity)) return;
            seen.add(identity);
            const weight = Math.pow(.2, Math.abs(p.absIndex - activeIndex));
            entries.push({ item: { ...item, book: p.book, unit: p.unit, page: p.page, key, srType: bucket }, key, pageAbsIndex: p.absIndex,
                priority: status || priority(key, bucket), score: Math.random() * weight, varietyEligible });
        };
        for (const p of pages.slice(0, activeIndex + 1).reverse()) {
            if (options.pageOnly && (String(p.unit) !== String(unit) || String(p.page) !== String(page))) continue;
            // Availability can include not-yet-authored pages. Match the legacy
            // SR picker's guard; retain absIndex gaps for proximity weighting.
            const content = TEACHING_CONTENT[p.book] && TEACHING_CONTENT[p.book][p.unit] && TEACHING_CONTENT[p.book][p.unit][p.page];
            if (!content) continue;
            for (const item of content.nonSpellingExercises || []) {
                if (item.type === 'sentence-scramble') {
                    const sentence = Array.isArray(item.sentence) ? item.sentence[0] : item.sentence;
                    if (typeof sentence === 'string' && sentence.trim()) add(item, p, itemKey(item.sentence), 'sentences');
                } else if (item.type === 'missing-word' || item.type === 'find-fix') {
                    add(item, p, typedKey(item, p), 'sentences');
                } else if (item.type === 'sentence-match') {
                    const pairs = (item.pairs || []).filter(pair => {
                        const key = itemKey(pair);
                        if (!pair.a || !pair.b || seenPairs.has(key)) return false;
                        seenPairs.add(key);
                        return true;
                    }).map(pair => ({ pair, priority: priority(itemKey(pair), 'sentencePairs'), tie: Math.random() }));
                    const eligible = pairs.filter(p => p.priority.group !== 4).sort((a, b) => a.priority.group - b.priority.group || b.tie - a.tie);
                    const cooldown = pairs.filter(p => p.priority.group === 4).sort((a, b) => a.priority.dueAfterSession - b.priority.dueAfterSession);
                    const size = Math.min(3, pairs.length);
                    if (!size) continue;
                    const addBoard = selected => {
                        const boardPairs = selected.map(p => p.pair);
                        const cooling = selected.filter(p => p.priority.group === 4);
                        const pickable = selected.filter(p => p.priority.group !== 4);
                        const status = pickable.length
                            ? pickable.reduce((best, p) => p.priority.group < best.group ? p.priority : best, pickable[0].priority)
                            : { group: 4, dueAfterSession: Math.max(...cooling.map(p => p.priority.dueAfterSession)) };
                        add({ type: 'sentence-match', pairs: boardPairs }, p, boardPairs.map(itemKey).sort().join(' || '), 'sentencePairs', status, cooling.length === 0);
                    };
                    while (eligible.length >= size) addBoard(eligible.splice(0, size));
                    // Serve a due pair even if its board needs cooldown partners.
                    // Such a board may win on SR, but cannot be pulled just for variety.
                    const remaining = [...eligible, ...cooldown];
                    while (remaining.length >= size) addBoard(remaining.splice(0, size));
                }
            }
        }
        return { entries, activeIndex };
    }

    function select(book, unit, page, count = 5, options = {}) {
        const { entries } = buildPool(book, unit, page, options);
        const compare = (a, b) => a.priority.group - b.priority.group || b.score - a.score;
        let eligible = entries.filter(e => e.priority.group !== 4).sort(compare);
        const cooldown = entries.filter(e => e.priority.group === 4)
            .sort((a, b) => a.priority.dueAfterSession - b.priority.dueAfterSession || b.score - a.score);
        if (options.avoidKey && eligible.some(e => e.key !== options.avoidKey)) eligible = eligible.filter(e => e.key !== options.avoidKey);
        const picked = pickWithNewQuota(eligible, count);
        if (count > 1) {
            const varietyPool = eligible.filter(e => e.varietyEligible);
            const targetTypes = Math.min(3, new Set(varietyPool.map(e => e.item.type)).size, count);
            for (const candidate of varietyPool) {
                if (new Set(picked.map(e => e.item.type)).size >= targetTypes) break;
                if (picked.some(e => e.item.type === candidate.item.type)) continue;
                let replaceIndex = -1;
                for (let i = picked.length - 1; i >= 0; i--) {
                    if (picked.filter(p => p.item.type === picked[i].item.type).length > 1) { replaceIndex = i; break; }
                }
                if (replaceIndex >= 0) picked.splice(replaceIndex, 1, candidate);
            }
        }
        const used = new Set(picked.map(e => e.item.type + ':' + e.key));
        for (const entry of cooldown) {
            if (picked.length >= count) break;
            const identity = entry.item.type + ':' + entry.key;
            if (!used.has(identity)) { picked.push(entry); used.add(identity); }
        }
        return shuffleArray(picked).map(e => e.item);
    }
    function selectPage(book, unit, page, count = 5) {
        return shuffleArray(buildPool(book, unit, page, { pageOnly: true }).entries.slice()).slice(0, count).map(e => e.item);
    }
    window.NonSpellingContent = { catalog, normalize, buildPool, select, selectPage, typedKey };
    normalize();
})();
