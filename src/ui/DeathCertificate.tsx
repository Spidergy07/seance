// The death certificate: the recovery report, themed. It states when the site
// last worked, how much of the page came back, and exactly what did not. Every
// themed phrase is paired with its literal meaning, numbers are explicit, and
// an unknown asset is never counted as recovered (voice.md, R4.3, R5.1–R5.4,
// design.md §6).

import type { AssetKind, RecoveryReport } from '../core/types.js';
import { groupMissingByKind } from '../core/recovery.js';
import { formatCaptureDate } from './format.js';

export interface DeathCertificateProps {
  report: RecoveryReport;
}

const KIND_LABELS: Record<AssetKind, string> = {
  image: 'Images',
  stylesheet: 'Stylesheets',
  script: 'Scripts',
  media: 'Media',
  flash: 'Flash',
  other: 'Other',
};

const MISSING_LIST_ID = 'missing-spirits';

export function DeathCertificate({ report }: DeathCertificateProps) {
  const { selectedCapture, lastWorkingCapture, recoveredCount, totalCount, recoveryPercent } =
    report;

  const missingCount = report.assets.filter((a) => a.status === 'missing').length;
  const unknownCount = report.assets.filter((a) => a.status === 'unknown').length;
  const missingByKind = groupMissingByKind(report.assets);

  const selectedDiffers =
    lastWorkingCapture !== null &&
    selectedCapture.timestamp !== lastWorkingCapture.timestamp;

  return (
    <section className="certificate" aria-labelledby="certificate-title">
      <header className="certificate__head">
        <h2 id="certificate-title" className="certificate__title">
          Death certificate{' '}
          <span className="certificate__literal">
            — what we recovered and what we could not
          </span>
        </h2>
      </header>

      <dl className="certificate__facts">
        <div className="fact">
          <dt className="fact__term">Died on (last working capture)</dt>
          <dd className="fact__value">
            {lastWorkingCapture !== null
              ? formatCaptureDate(lastWorkingCapture.timestamp)
              : 'No working capture found'}
          </dd>
        </div>
        {selectedDiffers && (
          <div className="fact">
            <dt className="fact__term">Showing the capture from</dt>
            <dd className="fact__value">
              {formatCaptureDate(selectedCapture.timestamp)}
            </dd>
          </div>
        )}
      </dl>

      <div className="recovery">
        <div className="recovery__top">
          <span className="recovery__label">Recovery</span>
          <span className="recovery__percent">{recoveryPercent}%</span>
        </div>
        <div
          className="meter"
          role="meter"
          aria-label="Share of referenced assets recovered from the archive"
          aria-valuenow={recoveryPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${recoveryPercent}% recovered`}
        >
          <span className="meter__fill" style={{ width: `${recoveryPercent}%` }} />
        </div>
        <p className="recovery__count">
          {recoveredCount} of {totalCount} assets recovered from the Internet
          Archive.
        </p>
      </div>

      <ul className="tally" aria-label="Asset tally">
        <li className="tally__item tally__item--missing">
          {missingCount > 0 ? (
            <a href={`#${MISSING_LIST_ID}`}>
              {missingCount} missing {missingCount === 1 ? 'spirit' : 'spirits'}{' '}
              (assets with no saved copy)
            </a>
          ) : (
            <span>0 missing spirits (assets with no saved copy)</span>
          )}
        </li>
        {unknownCount > 0 && (
          <li className="tally__item tally__item--unknown">
            {unknownCount} unknown ({unknownCount === 1 ? 'its' : 'their'} status
            could not be checked; not counted as recovered)
          </li>
        )}
      </ul>

      {missingCount > 0 && (
        <section
          id={MISSING_LIST_ID}
          className="missing"
          aria-label="Missing assets, grouped by type"
        >
          <h3 className="missing__title">Missing spirits</h3>
          {(Object.keys(missingByKind) as AssetKind[]).map((kind) => {
            const assets = missingByKind[kind];
            if (assets === undefined || assets.length === 0) {
              return null;
            }
            return (
              <div className="missing__group" key={kind}>
                <h4 className="missing__kind">
                  {KIND_LABELS[kind]} ({assets.length})
                </h4>
                <ul className="missing__urls">
                  {assets.map((asset) => (
                    <li key={asset.originalUrl}>{asset.originalUrl}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </section>
  );
}
