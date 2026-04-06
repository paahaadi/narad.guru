"use client";

import { useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { CorpWatchGraphData } from "@/lib/workspaces/corpwatch-types";

interface NetworkGraphProps {
  data: CorpWatchGraphData;
}

export function NetworkGraph({ data }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // We need to re-map nodes and edges for the graph component
  const graphData = {
    nodes: data.nodes.map(n => ({
      id: n.entityId,
      name: n.name,
      val: n.isCentral ? 20 : n.entityType === "event" ? 5 : 10,
      color: n.isCentral ? "#eab308" : n.entityType === "event" ? "#3b82f6" : "#10b981",
    })),
    links: data.edges.map(e => ({
      source: e.sourceEntityId,
      target: e.targetEntityId,
      label: e.relationshipType,
    }))
  };

  return (
    <div ref={containerRef} className="graph-container" style={{ width: "100%", height: "400px", border: "1px solid #333", borderRadius: "8px", overflow: "hidden" }}>
      <ForceGraph2D
        graphData={graphData}
        width={800} // fallback, usually you'd track container width
        height={400}
        nodeId="id"
        nodeLabel="name"
        nodeAutoColorBy="group"
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={d => 0.005} // fixed particle speed
        backgroundColor="#000000"
        nodeColor={node => (node as any).color}
      />
    </div>
  );
}
