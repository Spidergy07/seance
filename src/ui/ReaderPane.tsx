// The Reader pane: a clean, mobile-readable version of the page, extracted by
// Readability and already rewritten to load its images from the archive. On a
// narrow screen this pane comes first because it is the readable one (R7.2).
// When no article is found, it says so plainly and the restored page still
// stands (R7.3). See design.md §10.
//
// Readability returns a sanitised content fragment (scripts and handlers
// stripped), so it renders in the app's own origin rather than the sandboxed
// iframe the untrusted restored HTML uses.

import type { ReaderResult } from '../dom/reader.js';

export interface ReaderPaneProps {
  reader: ReaderResult;
}

export function ReaderPane({ reader }: ReaderPaneProps) {
  return (
    <section className="pane pane--reader" aria-label="Reader view">
      <header className="pane__head">
        <h2 className="pane__title">Reader</h2>
        <p className="pane__subtitle">A clean, readable version.</p>
      </header>

      {reader.ok ? (
        <article className="reader">
          {reader.title !== '' && (
            <h3 className="reader__title">{reader.title}</h3>
          )}
          <div
            className="reader__body"
            // Sanitised Readability output; asset URLs point at the archive.
            dangerouslySetInnerHTML={{ __html: reader.contentHtml }}
          />
        </article>
      ) : (
        <div className="reader reader--empty" role="note">
          <p>
            No readable article. Seance could not find the main text on this
            page. The restored page is still shown.
          </p>
        </div>
      )}
    </section>
  );
}
