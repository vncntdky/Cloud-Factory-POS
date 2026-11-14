// Help: the app handbook (screens in pictures, words, what to do when something looks wrong) and the
// shop's SOPs. Everyone; staff only see what applies to them. Content lives in lib/help.ts.
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { Topbar } from "@/components/Topbar";
import { requireActiveStaff } from "@/lib/auth";
import { GOLDEN_RULES, PICTURES, PROBLEMS, SCREENS, SOPS, WHO_DOES_WHAT, WORDS, type Sop, type Step } from "@/lib/help";

export const dynamic = "force-dynamic";

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="help-steps">
      {steps.map((s, i) =>
        typeof s === "string" ? (
          <li key={i}>{s}</li>
        ) : (
          <li key={i}>
            {s.text}
            <ul>
              {s.sub.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ol>
  );
}

function roleChip(sop: Sop) {
  if (sop.roles.length === 3) return "Everyone";
  if (sop.roles.length === 1) return "Owner";
  return "Owner & manager";
}

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ tab?: string; sop?: string }> }) {
  const { profile } = await requireActiveStaff();
  const sp = await searchParams;
  const tab = sp.tab === "sops" ? "sops" : "guide";
  const manager = profile.role !== "cashier";
  const openSop = Number(sp.sop) || null;
  // Managers see every procedure (owner-only ones are marked Owner); staff see the ones they do.
  const sops = manager ? SOPS : SOPS.filter((s) => s.roles.includes(profile.role));
  const sopHref = (no: number) => `/help?tab=sops&sop=${no}#sop-${no}`;
  const canSee = (x: { managers?: boolean }) => manager || !x.managers;

  return (
    <>
      <Topbar title="Help" />
      <Main>
        <div className="stack stack-6 narrow help">
          <nav className="segmented" aria-label="Help">
            <Link className="segmented__option" href="/help" aria-current={tab === "guide" ? "page" : undefined}>
              Handbook
            </Link>
            <Link className="segmented__option" href="/help?tab=sops" aria-current={tab === "sops" ? "page" : undefined}>
              SOPs
            </Link>
          </nav>

          {tab === "guide" ? (
            <>
              <p className="t-sm muted">
                What each screen is for, the words the app uses, and what to do when something looks wrong. Step-by-step tasks
                are under <Link href="/help?tab=sops">SOPs</Link>.
              </p>

              <section className="stack stack-2" aria-labelledby="pics-t">
                <h2 className="eyebrow" id="pics-t">
                  The app in pictures
                </h2>
                <p className="t-sm muted">Sample products shown. The red numbers match the steps.</p>
                {PICTURES.filter(canSee).map((p) => (
                  <details key={p.id} className="cat" id={p.id}>
                    <summary className="cat__head">
                      <span className="cat__main">
                        <span className="cat__name">{p.title}</span>
                        <span className="cat__meta">SOP {p.sop}</span>
                      </span>
                      <Icon name="chevron-down" className="cat__chevron" />
                    </summary>
                    <div className="help-pic">
                      <img src={p.img} alt={p.alt} width={390} height={844} loading="lazy" decoding="async" />
                      <div className="stack stack-2">
                        <Steps steps={p.steps} />
                        <Link className="text-btn" href={sopHref(p.sop)}>
                          Full steps: SOP {p.sop}
                        </Link>
                      </div>
                    </div>
                  </details>
                ))}
              </section>

              <section className="card card--flush" aria-labelledby="screens-t">
                <div className="card__head">
                  <h2 className="card__title" id="screens-t">
                    The screens
                  </h2>
                </div>
                <ul className="list list--plain" role="list">
                  {SCREENS.filter(canSee).map((s) => (
                    <li key={s.href}>
                      <Link className="list-row" href={s.href}>
                        <span className="list-row__main">
                          <span className="list-row__title">
                            <span>{s.screen}</span>
                          </span>
                          <span className="list-row__meta">{s.what}</span>
                          <span className="t-caption muted">{s.who}</span>
                        </span>
                        <Icon name="chevron-right" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card stack" aria-labelledby="words-t">
                <h2 className="card__title" id="words-t">
                  Words the app uses
                </h2>
                <dl className="help-words">
                  {WORDS.filter(canSee).map((w) => (
                    <div key={w.word}>
                      <dt>{w.word}</dt>
                      <dd>{w.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="card stack" aria-labelledby="wrong-t">
                <h2 className="card__title" id="wrong-t">
                  When something looks wrong
                </h2>
                <dl className="help-words">
                  {PROBLEMS.filter(canSee).map((p) => (
                    <div key={p.see}>
                      <dt>{p.see}</dt>
                      <dd>{p.doThis}</dd>
                    </div>
                  ))}
                </dl>
                <p className="t-sm muted">
                  Anything not covered here: write down what you tapped and what the screen said, and tell the owner the same
                  day.
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="card stack" aria-labelledby="rules-t">
                <h2 className="card__title" id="rules-t">
                  Golden rules
                </h2>
                <ol className="help-steps">
                  {GOLDEN_RULES.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </section>

              {manager && (
                <section className="card card--flush" aria-labelledby="who-t">
                  <div className="card__head">
                    <h2 className="card__title" id="who-t">
                      Who does what
                    </h2>
                  </div>
                  <div className="table-wrap help-who">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Task</th>
                          <th scope="col">Owner</th>
                          <th scope="col">Manager</th>
                          <th scope="col">Staff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WHO_DOES_WHAT.map((r) => (
                          <tr key={r.task}>
                            <td>{r.task}</td>
                            {[r.owner, r.manager, r.staff].map((ok, i) => (
                              <td key={i} className="help-who__mark">
                                {ok ? <Icon name="check" size={18} /> : <span className="muted">–</span>}
                                <span className="sr-only">{ok ? "Yes" : "No"}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className="stack stack-2" aria-labelledby="sops-t">
                <h2 className="eyebrow" id="sops-t">
                  {manager ? "All procedures" : "Your procedures"}
                </h2>
                {sops.map((s) => (
                  <details key={s.no} className="cat" id={`sop-${s.no}`} open={openSop === s.no}>
                    <summary className="cat__head">
                      <span className="cat__main">
                        <span className="cat__name">
                          SOP {s.no}: {s.title}
                        </span>
                        <span className="cat__meta">{roleChip(s)}</span>
                      </span>
                      <Icon name="chevron-down" className="cat__chevron" />
                    </summary>
                    <div className="help-sop stack">
                      <p className="t-sm">
                        <strong>Who:</strong> {s.who} <strong>When:</strong> {s.when}
                      </p>
                      {s.parts.map((p, i) => (
                        <div key={i} className="stack stack-2">
                          {p.title && <h3 className="help-sop__part">{p.title}</h3>}
                          <Steps steps={p.steps} />
                        </div>
                      ))}
                      {s.notes?.map((n) => (
                        <p key={n.label} className="t-sm">
                          <strong>{n.label}:</strong> {n.text}
                        </p>
                      ))}
                      <p className="help-check t-sm">
                        <Icon name="check" size={18} />
                        <span>
                          <strong>Check:</strong> {s.check}
                        </span>
                      </p>
                    </div>
                  </details>
                ))}
              </section>
            </>
          )}
        </div>
      </Main>
    </>
  );
}
