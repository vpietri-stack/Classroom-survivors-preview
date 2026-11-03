'use strict';
// Run the same complete login/Study/SR/target/account-isolation contract with
// the corrected PU1 page and its actual existing exercise widgets.
process.argv.push('--pu1');
require('./test_preview_notes_browser');
