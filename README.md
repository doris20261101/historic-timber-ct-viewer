# VIC1 CT viewer: hide NRRD URL controls

The only functional HTML change is `style="display: none;"` on the `<section class="toolbar">` element. The input, load button, and status elements are deliberately kept in the DOM for `src.js` compatibility. The user-supplied `DEFAULT_NRRD_URL` is unchanged.

## Update existing GitHub/Vercel site

Replace only `index.html` in your existing **CT viewer** repository. Leave `src.js`, CSS, and your existing `config.js` as they are. If your `config.js` is missing or changed, the included `config.js` contains the user-provided URL.

This change **hides the toolbar only**. Auto-loading still depends on `src.js` reading `DEFAULT_NRRD_URL` and invoking the load function on startup. If the CT volume does not auto-load, please provide `src.js` so that its startup logic can be fixed without guessing.

Note: this does not make the NRRD URL private or access-controlled.
