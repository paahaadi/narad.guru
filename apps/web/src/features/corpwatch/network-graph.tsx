"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CorpWatchGraphData, CorpWatchGraphNode, CorpWatchRelationshipEdge } from "@/lib/workspaces/corpwatch-types";

type SimNode = CorpWatchGraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
};

type SimLink = {
  source: SimNode;
  target: SimNode;
  edge: CorpWatchRelationshipEdge;
};

function nodeColor(node: CorpWatchGraphNode): string {
  if (node.isCentral) return "#ec7609";
  switch (node.entityType) {
    case "company": return "#8ce7ff";
    case "person": return "#ffc48e";
    case "regulator": return "#ee7d77";
    case "event": return "#7dd3a4";
    default: return "#6c758c";
  }
}

function nodeGlow(node: CorpWatchGraphNode): string {
  if (node.isCentral) return "rgba(236, 118, 9, 0.35)";
  switch (node.entityType) {
    case "company": return "rgba(140, 231, 255, 0.2)";
    case "person": return "rgba(255, 196, 142, 0.2)";
    case "regulator": return "rgba(238, 125, 119, 0.2)";
    case "event": return "rgba(125, 211, 164, 0.2)";
    default: return "rgba(108, 117, 140, 0.15)";
  }
}

function nodeRadius(node: CorpWatchGraphNode): number {
  if (node.isCentral) return 32;
  const baseRadius = 14;
  const riskBonus = Math.min(node.riskScore / 10, 8);
  return baseRadius + riskBonus;
}

function truncateLabel(name: string, maxLen = 12): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
}

function entityBadge(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

interface NetworkGraphProps {
  data: CorpWatchGraphData;
  height?: number;
}

export function NetworkGraph({ data, height = 380 }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const hoveredRef = useRef<SimNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ node: SimNode; startX: number; startY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const router = useRouter();

  const buildSimulation = useCallback(() => {
    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: n.isCentral ? 0 : (Math.random() - 0.5) * 300,
      y: n.isCentral ? 0 : (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      radius: nodeRadius(n),
      color: nodeColor(n),
      glowColor: nodeGlow(n),
    }));

    const nodeMap = new Map(nodes.map((n) => [n.entityId, n]));

    const links: SimLink[] = data.edges
      .map((edge) => {
        const source = nodeMap.get(edge.sourceEntityId);
        const target = nodeMap.get(edge.targetEntityId);
        if (!source || !target) return null;
        return { source, target, edge };
      })
      .filter((l): l is SimLink => l !== null);

    nodesRef.current = nodes;
    linksRef.current = links;

    // Run force simulation manually
    const alpha = 1;
    const alphaDecay = 0.0228;
    const alphaMin = 0.001;
    let currentAlpha = alpha;

    function tick() {
      currentAlpha += (0 - currentAlpha) * alphaDecay;
      if (currentAlpha < alphaMin) return;

      // Center force
      for (const node of nodes) {
        node.vx -= node.x * 0.01;
        node.vy -= node.y * 0.01;
      }

      // Charge (repel)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const strength = -280 * currentAlpha / (dist * dist);
          const fx = dx / dist * strength;
          const fy = dy / dist * strength;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // Link force
      for (const link of links) {
        let dx = link.target.x - link.source.x;
        let dy = link.target.y - link.source.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 120;
        const strength = (dist - targetDist) / dist * 0.1 * currentAlpha;
        const fx = dx * strength;
        const fy = dy * strength;
        link.source.vx += fx;
        link.source.vy += fy;
        link.target.vx -= fx;
        link.target.vy -= fy;
      }

      // Collision
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 8;
          if (dist < minDist) {
            const overlap = (minDist - dist) / dist * 0.5;
            a.x -= dx * overlap;
            a.y -= dy * overlap;
            b.x += dx * overlap;
            b.y += dy * overlap;
          }
        }
      }

      // Velocity
      const velocityDecay = 0.6;
      for (const node of nodes) {
        node.x += node.vx *= velocityDecay;
        node.y += node.vy *= velocityDecay;
      }
    }

    // Run simulation for settling
    for (let i = 0; i < 300; i++) tick();
  }, [data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const t = transformRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(w / 2 + t.x, h / 2 + t.y);
    ctx.scale(t.k, t.k);

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const hovered = hoveredRef.current;

    // Draw edges
    for (const link of links) {
      const opacity = link.edge.confidence * 0.6 + 0.15;
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = `rgba(108, 117, 140, ${opacity})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Edge label
      const midX = (link.source.x + link.target.x) / 2;
      const midY = (link.source.y + link.target.y) / 2;
      ctx.fillStyle = "rgba(162, 171, 196, 0.55)";
      ctx.font = "9px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(link.edge.relationshipType, midX, midY - 6);

      // Arrow
      const angle = Math.atan2(link.target.y - link.source.y, link.target.x - link.source.x);
      const arrowDist = link.target.radius + 6;
      const ax = link.target.x - Math.cos(angle) * arrowDist;
      const ay = link.target.y - Math.sin(angle) * arrowDist;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - Math.cos(angle - 0.35) * 8, ay - Math.sin(angle - 0.35) * 8);
      ctx.lineTo(ax - Math.cos(angle + 0.35) * 8, ay - Math.sin(angle + 0.35) * 8);
      ctx.closePath();
      ctx.fillStyle = `rgba(108, 117, 140, ${opacity + 0.1})`;
      ctx.fill();
    }

    // Draw nodes
    for (const node of nodes) {
      const isHovered = hovered?.entityId === node.entityId;

      // Glow
      if (node.isCentral || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = node.glowColor;
        ctx.fill();
      }

      // Body
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered
        ? node.color
        : node.isCentral
          ? "rgba(236, 118, 9, 0.22)"
          : "rgba(20, 26, 38, 0.92)";
      ctx.fill();
      ctx.strokeStyle = node.color;
      ctx.lineWidth = isHovered ? 2.5 : 1.8;
      ctx.stroke();

      // Label
      ctx.fillStyle = isHovered ? "#ffffff" : node.isCentral ? "#ffd6b3" : "#dce5ff";
      ctx.font = node.isCentral
        ? "bold 12px 'Manrope', sans-serif"
        : "bold 10px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        node.isCentral ? entityBadge(node.name) : truncateLabel(node.name, 10),
        node.x,
        node.y,
      );
    }

    ctx.restore();

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    buildSimulation();
  }, [buildSimulation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const t = transformRef.current;
    const x = (clientX - rect.left - rect.width / 2 - t.x) / t.k;
    const y = (clientY - rect.top - rect.height / 2 - t.y) / t.k;
    return { x, y };
  }, []);

  const findNode = useCallback((wx: number, wy: number): SimNode | null => {
    for (const node of nodesRef.current) {
      const dx = node.x - wx;
      const dy = node.y - wy;
      if (dx * dx + dy * dy <= (node.radius + 4) * (node.radius + 4)) {
        return node;
      }
    }
    return null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (dragRef.current) {
      dragRef.current.node.x = x;
      dragRef.current.node.y = y;
      dragRef.current.node.vx = 0;
      dragRef.current.node.vy = 0;
      return;
    }

    if (panRef.current) {
      transformRef.current.x = panRef.current.originX + (e.clientX - panRef.current.startX);
      transformRef.current.y = panRef.current.originY + (e.clientY - panRef.current.startY);
      return;
    }

    const node = findNode(x, y);
    hoveredRef.current = node;

    const tooltip = tooltipRef.current;
    if (tooltip) {
      if (node) {
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        if (rect) {
          const t = transformRef.current;
          const sx = node.x * t.k + rect.width / 2 + t.x;
          const sy = node.y * t.k + rect.height / 2 + t.y;
          tooltip.style.left = `${sx}px`;
          tooltip.style.top = `${sy}px`;
          tooltip.textContent = `${node.name} · ${node.entityType} · risk ${Math.round(node.riskScore)}`;
          tooltip.classList.add("is-visible");
        }
      } else {
        tooltip.classList.remove("is-visible");
      }
    }

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = node ? "pointer" : "grab";
    }
  }, [screenToWorld, findNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const node = findNode(x, y);

    if (node) {
      dragRef.current = { node, startX: e.clientX, startY: e.clientY };
    } else {
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: transformRef.current.x,
        originY: transformRef.current.y,
      };
    }
  }, [screenToWorld, findNode]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const moved = Math.abs(e.clientX - dragRef.current.startX) + Math.abs(e.clientY - dragRef.current.startY);
      if (moved < 5 && !dragRef.current.node.isCentral) {
        router.push(`/corpwatch/${dragRef.current.node.entityId}`);
      }
      dragRef.current = null;
    }
    panRef.current = null;
  }, [router]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.92 : 1.08;
    const newK = Math.max(0.3, Math.min(3, transformRef.current.k * scaleFactor));
    transformRef.current.k = newK;
  }, []);

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          hoveredRef.current = null;
          dragRef.current = null;
          panRef.current = null;
          if (tooltipRef.current) tooltipRef.current.classList.remove("is-visible");
        }}
        onWheel={handleWheel}
      />
      <div ref={tooltipRef} className="graph-canvas__tooltip" />
    </div>
  );
}
