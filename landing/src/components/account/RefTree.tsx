import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { apiGet } from '../../lib/api';

export interface RefStats {
  direct: number;
  total: number;
  by_level: { level: number; count: number }[];
  earned_micro?: string;
}

export interface TreeRow {
  level: number;
  parent_user_id: number;
  user_id: number;
  ref_code: string;
  tg_username: string | null;
  username_masked: string | null;
  joined_at: string;
}

interface NodeDetail {
  id: number;
  level: number;
  ref_code: string;
  tg_username: string | null;
  joined_at: string;
  wallet: { address: string; address_short: string; chain_id: number } | null;
  agent_count: number;
  direct_invites: number;
}

interface GraphNode extends SimulationNodeDatum {
  id: number;
  level: number;
  ref_code: string;
  username_masked: string | null;
  pinned?: boolean;
}

type GraphLink = SimulationLinkDatum<GraphNode>;

interface Props {
  stats: RefStats | null;
  refCode: string;
  rootUserId: number;
  emptyTitle: string;
  emptyHint: string;
  legendDirect: string;
  legendNetwork: string;
  legendYou: string;
}

const VIEW = 800;

/**
 * Obsidian-style referral graph.
 *
 *  - d3-force simulation keeps a small alphaTarget so nodes breathe forever.
 *  - Positions are updated IMPERATIVELY on every tick via refs — React does
 *    not re-render; we just mutate the SVG transforms. That's what keeps
 *    100+ nodes smooth at 60fps.
 *  - d3-zoom handles wheel/pinch zoom and drag pan on the whole `<g world>`.
 *  - A "list" view is available via toggle — same data, flat sortable table.
 */
export function RefTree({
  stats, refCode, rootUserId,
  emptyTitle, emptyHint,
  legendYou, legendDirect, legendNetwork,
}: Props) {
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [rows, setRows] = useState<TreeRow[] | null>(null);
  const [selected, setSelected] = useState<NodeDetail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  const total = stats?.total ?? 0;

  useEffect(() => {
    if (total === 0) { setRows(null); return; }
    let alive = true;
    (async () => {
      try {
        const res = await apiGet<{ rows: TreeRow[] }>(`/referrals/tree?depth=100&limit=500`);
        if (alive) setRows(res.rows ?? []);
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, [total]);

  const openNode = useCallback(async (userId: number) => {
    if (userId === rootUserId) return;
    setSelectedLoading(true);
    try {
      const det = await apiGet<NodeDetail>(`/referrals/node/${userId}`);
      setSelected(det);
    } catch { setSelected(null); }
    finally { setSelectedLoading(false); }
  }, [rootUserId]);

  if (!stats || total === 0) {
    return (
      <div className="af-acc-tree">
        <div className="af-acc-tree-empty">
          <div className="af-acc-tree-empty-icon">◉</div>
          <h4>{emptyTitle}</h4>
          <p>{emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="af-acc-tree">
      <div className="af-acc-tree-toolbar">
        <div className="af-acc-tree-legend">
          <span><i style={{ background: '#d4ff00' }} />{legendYou}</span>
          <span><i style={{ background: '#00ff9d' }} />{legendDirect}</span>
          <span><i style={{ background: '#4a5bff' }} />{legendNetwork}</span>
        </div>
        <div className="af-acc-tree-viewtoggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'graph'}
            className={view === 'graph' ? 'active' : undefined}
            onClick={() => setView('graph')}
          >
            Graph
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={view === 'list' ? 'active' : undefined}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {view === 'graph' ? (
        <GraphView
          rows={rows}
          rootUserId={rootUserId}
          refCode={refCode}
          onOpen={openNode}
        />
      ) : (
        <ListView rows={rows} onOpen={openNode} />
      )}

      {(selected || selectedLoading) && (
        <div className="af-acc-tree-detail">
          <button className="af-acc-tree-detail-close" onClick={() => setSelected(null)} aria-label="Close">✕</button>
          {selectedLoading && !selected ? (
            <div className="af-acc-tree-detail-loading">…</div>
          ) : selected ? <DetailCard d={selected} /> : null}
        </div>
      )}
    </div>
  );
}

/* ─────────── Graph view with imperative sim + zoom ─────────── */

function GraphView({
  rows, rootUserId, refCode, onOpen,
}: {
  rows: TreeRow[] | null;
  rootUserId: number;
  refCode: string;
  onOpen: (id: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const nodeRefs = useRef<Map<number, SVGGElement>>(new Map());
  const linkRefs = useRef<Map<string, SVGLineElement>>(new Map());
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const initials = useMemo(() => refCode.slice(0, 2).toUpperCase(), [refCode]);

  // Build sim ONCE per data change. Imperative updates on tick.
  useEffect(() => {
    if (!rows || rows.length === 0) return;

    const cx = VIEW / 2, cy = VIEW / 2;
    const nodes: GraphNode[] = [
      { id: rootUserId, level: 0, ref_code: refCode, username_masked: null,
        fx: cx, fy: cy, pinned: true, x: cx, y: cy },
      ...rows.map(r => ({
        id: r.user_id,
        level: r.level,
        ref_code: r.ref_code,
        username_masked: r.username_masked,
        x: cx + (Math.random() - 0.5) * 80,
        y: cy + (Math.random() - 0.5) * 80,
      } satisfies GraphNode)),
    ];
    const links: GraphLink[] = rows.map(r => ({
      source: r.parent_user_id,
      target: r.user_id,
    }));

    simRef.current?.stop();
    const sim = forceSimulation(nodes)
      .force('link', forceLink<GraphNode, GraphLink>(links)
        .id(n => n.id)
        .distance(d => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          return 50 + Math.max(s.level, t.level) * 4;
        })
        .strength(0.35))
      .force('charge', forceManyBody().strength(-90).distanceMax(260))
      .force('collide', forceCollide<GraphNode>().radius(12).strength(0.8))
      .force('center', forceCenter(cx, cy).strength(0.04))
      .alpha(1)
      .alphaDecay(0.02)
      .alphaTarget(0.015)       // never fully cools — lively breathing
      .velocityDecay(0.5)
      .on('tick', () => {
        // Imperative: write transforms directly onto DOM. Zero React work.
        for (const n of nodes) {
          const el = nodeRefs.current.get(n.id);
          if (el && n.x != null && n.y != null) {
            el.setAttribute('transform', `translate(${n.x},${n.y})`);
          }
        }
        for (const l of links as Array<GraphLink & { source: GraphNode; target: GraphNode }>) {
          const s = l.source as GraphNode;
          const t = l.target as GraphNode;
          const key = `${s.id}-${t.id}`;
          const el = linkRefs.current.get(key);
          if (el && s.x != null && t.x != null) {
            el.setAttribute('x1', String(s.x));
            el.setAttribute('y1', String(s.y!));
            el.setAttribute('x2', String(t.x));
            el.setAttribute('y2', String(t.y!));
          }
        }
      });
    simRef.current = sim;
    return () => { sim.stop(); };
  }, [rows, rootUserId, refCode]);

  // d3-zoom setup
  useEffect(() => {
    if (!svgRef.current || !worldRef.current) return;
    const svg = select(svgRef.current);
    const world = select(worldRef.current);

    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (ev) => {
        world.attr('transform', ev.transform.toString());
      });
    svg.call(zb);
    svg.call(zb.transform, zoomIdentity);
    zoomRef.current = zb;
    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  if (!rows) {
    return <div className="af-acc-tree-loading">…</div>;
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      preserveAspectRatio="xMidYMid meet"
      className="af-acc-tree-svg"
      role="img"
    >
      <defs>
        <radialGradient id="rt-you" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d4ff00" stopOpacity="1" />
          <stop offset="100%" stopColor="#d4ff00" stopOpacity="0.2" />
        </radialGradient>
        <radialGradient id="rt-l1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00ff9d" stopOpacity="1" />
          <stop offset="100%" stopColor="#00ff9d" stopOpacity="0.2" />
        </radialGradient>
        <radialGradient id="rt-deep" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4a5bff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4a5bff" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      {/* Invisible hit-rect so d3-zoom catches wheel/drag in empty areas. */}
      <rect x={0} y={0} width={VIEW} height={VIEW} fill="transparent" />
      <g ref={worldRef}>
        {/* links layer */}
        {rows.map(r => {
          const key = `${r.parent_user_id}-${r.user_id}`;
          return (
            <line
              key={`l-${key}`}
              ref={(el) => {
                if (el) linkRefs.current.set(key, el);
                else linkRefs.current.delete(key);
              }}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          );
        })}
        {/* root node */}
        <g
          ref={(el) => {
            if (el) nodeRefs.current.set(rootUserId, el);
            else nodeRefs.current.delete(rootUserId);
          }}
          style={{ cursor: 'default' }}
        >
          <circle r={24} fill="url(#rt-you)" />
          <circle r={17} fill="#0a0a0a" />
          <text
            textAnchor="middle" y={4}
            fill="#d4ff00" fontSize="11" fontWeight="800"
            fontFamily="ui-monospace,monospace"
          >
            {initials}
          </text>
        </g>
        {/* non-root nodes */}
        {rows.map(r => {
          const fill = r.level === 1 ? 'url(#rt-l1)' : 'url(#rt-deep)';
          const size = r.level === 1 ? 7 : Math.max(3, 7 - r.level * 0.5);
          return (
            <g
              key={`n-${r.user_id}`}
              ref={(el) => {
                if (el) nodeRefs.current.set(r.user_id, el);
                else nodeRefs.current.delete(r.user_id);
              }}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpen(r.user_id)}
            >
              <circle r={size + 5} fill="transparent" />
              <circle r={size} fill={fill}>
                <title>{r.username_masked ?? r.ref_code} · L{r.level}</title>
              </circle>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ─────────── List view ─────────── */

function ListView({
  rows, onOpen,
}: {
  rows: TreeRow[] | null;
  onOpen: (id: number) => void;
}) {
  if (!rows) return <div className="af-acc-tree-loading">…</div>;
  if (rows.length === 0) return <div className="af-acc-tree-loading">—</div>;

  return (
    <div className="af-acc-list-scroll">
      <table className="af-acc-ref-table">
        <thead>
          <tr>
            <th>L</th>
            <th>Name</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            // const _display = r.tg_username ? `@${r.tg_username}` : (r.username_masked ?? r.ref_code);
            return (
              <tr key={r.user_id} onClick={() => onOpen(r.user_id)}>
                <td>
                  <span className={`af-acc-ref-level af-acc-ref-level-${Math.min(r.level, 5)}`}>
                    L{r.level}
                  </span>
                </td>
                <td>
                  {r.tg_username
                    ? <span className="af-acc-ref-handle">@{r.tg_username}</span>
                    : <code>{r.username_masked ?? r.ref_code}</code>}
                </td>
                <td className="dim">{new Date(r.joined_at).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────── Detail card ─────────── */

function DetailCard({ d }: { d: NodeDetail }) {
  return (
    <>
      <div className="af-acc-tree-detail-head">
        <span className="af-acc-tree-detail-level">L{d.level}</span>
        <span className="af-acc-tree-detail-code">{d.ref_code}</span>
      </div>
      <dl className="af-acc-tree-detail-kv">
        <dt>Telegram</dt>
        <dd className={d.tg_username ? undefined : 'dim'}>
          {d.tg_username
            ? <a href={`https://t.me/${d.tg_username}`} target="_blank" rel="noreferrer">@{d.tg_username}</a>
            : 'not linked'}
        </dd>
        <dt>Wallet</dt>
        <dd className={d.wallet ? undefined : 'dim'}>
          {d.wallet ? d.wallet.address_short : '—'}
        </dd>
        <dt>Agents</dt>
        <dd>{d.agent_count > 0 ? <span className="acid">{d.agent_count}</span> : <span className="dim">0</span>}</dd>
        <dt>Direct invites</dt>
        <dd>{d.direct_invites}</dd>
        <dt>Joined</dt>
        <dd className="dim">{new Date(d.joined_at).toLocaleDateString()}</dd>
      </dl>
    </>
  );
}
