import { useNodeUtils } from './useNodeUtils';

export function useWorkflowConverter() {
    const { buildNodeHtml, buildDefaultNodeData, getFlowOutputs } = useNodeUtils();
    const CONTROL_PORT_NAME = "__control__";

    const isControlFlowOutputName = (name: string) => {
        const v = String(name || '').trim();
        return v === "next" || v === "true" || v === "false" || v === "try" || v === "catch";
    };

    /**
     * Converts Drawflow's exported JSON to our custom backend format
     */
    const convertToCustomFormat = (dfData: any) => {
        const workflowId = dfData.id || ''; // Should be handled by manager
        const customFormat: any = {
            id: workflowId,
            nodes: {},
            edges: []
        };

        const homeModule = dfData.drawflow?.Home || dfData.drawflow?.main || { data: {} };
        const dfNodes = homeModule.data;

        for (const id in dfNodes) {
            const dfNode = dfNodes[id];
            const action = dfNode.data?.action;

            if (!action) continue;

            const customNodeId = dfNode.data.customId || dfNode.id.toString();

            customFormat.nodes[customNodeId] = {
                id: customNodeId,
                action_id: action.id,
                position: { x: dfNode.pos_x, y: dfNode.pos_y },
                data: dfNode.data.data || {}
            };

            // Edges
            const flowOutputs = getFlowOutputs(action);
            for (const outputPort in dfNode.outputs) {
                const sourceOutputIndex = parseInt(outputPort.replace('output_', ''), 10) - 1;
                if (isNaN(sourceOutputIndex)) continue;

                const connections = dfNode.outputs[outputPort].connections || [];
                connections.forEach((conn: any) => {
                    const targetNode = dfNodes[conn.node];
                    if (!targetNode) return;

                    const targetCustomId = targetNode.data.customId || targetNode.id.toString();

                    const targetInputIndex = parseInt(conn.output.replace('input_', ''), 10) - 1;
                    if (isNaN(targetInputIndex)) return;

                    const sourceOutputName = flowOutputs.length
                        ? (flowOutputs[sourceOutputIndex] ? flowOutputs[sourceOutputIndex].name : "")
                        : CONTROL_PORT_NAME;
                    if (!sourceOutputName) return;

                    const targetInputName = CONTROL_PORT_NAME;

                    customFormat.edges.push({
                        id: `edge-${customNodeId}-${targetCustomId}-${sourceOutputIndex}-${targetInputIndex}`,
                        source_node: customNodeId,
                        source_output: sourceOutputName,
                        target_node: targetCustomId,
                        target_input: targetInputName
                    });
                });
            }
        }

        return customFormat;
    };

    /**
     * Converts our custom backend format back to Drawflow format
     */
    const convertToDrawflowFormat = (customData: any, actionPalette: any) => {
        const dfData: any = {
            drawflow: {
                Home: {
                    data: {}
                }
            }
        };

        if (!customData || !customData.nodes) return dfData;

        // Map custom string IDs to Drawflow integer IDs
        const customToDfIdMap = new Map<string, number>();
        let nextDfId = 1;

        const dfNodes = dfData.drawflow.Home.data;

        // Step 1: Add Nodes and establish ID mapping
        for (const customNodeId in customData.nodes) {
            const customNode = customData.nodes[customNodeId];
            const action = actionPalette[customNode.action_id];

            if (!action) {
                console.warn(`Action definition missing for ${customNode.action_id}`);
                continue;
            }

            const dfId = nextDfId++;
            customToDfIdMap.set(customNodeId, dfId);

            const flowOutputs = getFlowOutputs(action);
            const numInputs = 1;
            const numOutputs = flowOutputs.length ? flowOutputs.length : 1;

            const nodeData = {
                action: { ...action, id: customNode.action_id },
                data: customNode.data || buildDefaultNodeData(action),
                customId: customNodeId // Keep the original backend ID
            };

            dfNodes[dfId] = {
                id: dfId,
                name: customNode.action_id,
                data: nodeData,
                class: 'workflow-node',
                html: buildNodeHtml(action),
                typenode: false,
                inputs: {},
                outputs: {},
                pos_x: customNode.position?.x ?? 0,
                pos_y: customNode.position?.y ?? 0
            };

            // Initialize ports
            for (let i = 1; i <= Math.max(1, numInputs); i++) {
                dfNodes[dfId].inputs[`input_${i}`] = { connections: [] };
            }
            for (let i = 1; i <= Math.max(1, numOutputs); i++) {
                dfNodes[dfId].outputs[`output_${i}`] = { connections: [] };
            }
        }

        // Step 2: Add Edges using the mapping
        (customData.edges || []).forEach((edge: any) => {
            const sourceDfId = customToDfIdMap.get(edge.source_node);
            const targetDfId = customToDfIdMap.get(edge.target_node);

            if (sourceDfId === undefined || targetDfId === undefined) return;

            const sourceNode = dfNodes[sourceDfId];
            const targetNode = dfNodes[targetDfId];
            const sourceAction = sourceNode.data.action;

            const visible = edge.target_input === CONTROL_PORT_NAME || isControlFlowOutputName(edge.source_output);
            if (!visible) return;

            const sourceFlowOutputs = getFlowOutputs(sourceAction);

            const sourceOutputIndex = sourceFlowOutputs.length
                ? sourceFlowOutputs.findIndex((o: any) => o.name === edge.source_output)
                : 0;
            if (sourceFlowOutputs.length && sourceOutputIndex === -1) return;

            const sourcePortName = `output_${sourceOutputIndex + 1}`;
            const targetPortName = 'input_1';

            if (!sourceNode.outputs[sourcePortName]) {
                sourceNode.outputs[sourcePortName] = { connections: [] };
            }
            if (!targetNode.inputs[targetPortName]) {
                targetNode.inputs[targetPortName] = { connections: [] };
            }

            // Bi-directional connection in Drawflow format
            sourceNode.outputs[sourcePortName].connections.push({
                node: targetDfId.toString(),
                output: targetPortName
            });
            targetNode.inputs[targetPortName].connections.push({
                node: sourceDfId.toString(),
                input: sourcePortName
            });
        });

        return dfData;
    };

    return {
        convertToCustomFormat,
        convertToDrawflowFormat
    };
}
