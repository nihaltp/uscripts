# Google Forms Saver

A userscript to automatically fill Google Forms with saved data, making it easier to complete forms quickly.

## Features

- **Save & Reuse Responses**: Save multiple form responses per form for quick reuse later.
- **Floating Action Button**: Manage your saves easily directly from a floating action button available on any Google Form.
- **Conflict Resolution**: Smart interface that helps resolve conflicts when merging saved values with current form data.
- **Auto-load**: Automatically loads your saved data if there is only a single save for a given form.
- **Manage Saves**: Edit, rename, and delete your saved form responses directly within the popup modal.
- **Wide Field Support**: Seamless support for various form field types, including text, linear scales, dates, times, dropdowns, radios, and checkboxes.
- **Multi-page Support**: Works perfectly with forms that span multiple pages (SPA navigation aware).

## Installation

You can install this userscript via a script manager such as Tampermonkey, Greasemonkey, or Violentmonkey.

[Install Google Forms Auto Fill](https://raw.githubusercontent.com/nihaltp/uscripts/main/google_forms/dist/google-forms-saver.user.js)

## Development

To build the userscript locally from the source files:

1. Run the build script:

```bash
node build.js
```

2. The bundled script will be output to `dist/google-forms-saver.user.js`.
