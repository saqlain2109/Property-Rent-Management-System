import React from 'react';

/**
 * DevelopmentManualView
 * ----------------------
 * A simple view that provides a download button for the Property App
 * development manual (development_manual.md). The manual is placed in the
 * `client/public/` folder, so it is served statically at the root of the app.
 *
 * Usage
 * -----
 * Add this component to a route (e.g. `/manual`) or embed it in an existing
 * view where you want to expose the download link.
 */
export const DevelopmentManualView = () => (
  <div className="p-4">
    <h2 className="text-2xl font-semibold mb-4">Property App Development Manual</h2>
    <p className="mb-4">
      This document contains the UI/UX guidelines, component conventions and
      export specifications for the Property App. Click the button below to
      download it.
    </p>
    <a href="/development_manual.md" download>
      <button
        type="button"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 focus:outline-none"
      >
        Download Manual
      </button>
    </a>
  </div>
);
