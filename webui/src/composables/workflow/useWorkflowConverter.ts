import { useNodeUtils } from './useNodeUtils';

export function useWorkflowConverter() {
    const { buildNodeHtml, buildDefaultNodeData } = useNodeUtils();

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

            customFormat.nodes[dfNode.id] = {
                id: dfNode.id.toString(),
                action_id: action.id,
                position: { x: dfNode.pos_x, y: dfNode.pos_y },
                data: dfNode.data.data || {}
            };

            // Edges
            for (const outputPort in dfNode.outputs) {
                const sourceOutputIndex = parseInt(outputPort.replace('output_', ''), 10) - 1;
                if (isNaN(sourceOutputIndex)) continue;

                const connections = dfNode.outputs[outputPort].connections || [];
                connections.forEach((conn: any) => {
                    const targetNode = dfNodes[conn.node];
                    if (!targetNode) return;

                    const targetInputIndex = parseInt(conn.output.replace('input_', ''), 10) - 1;
                    if (isNaN(targetInputIndex)) return;

                    const sourceOutputName = (action.outputs && action.outputs[sourceOutputIndex])
                        ? action.outputs[sourceOutputIndex].name
                        : `output_${sourceOutputIndex + 1}`;

                    const targetAction = targetNode.data.action;
                    const targetInputName = (targetAction && targetAction.inputs && targetAction.inputs[targetInputIndex])
                        ? targetAction.inputs[targetInputIndex].name
                        : `input_${targetInputIndex + 1}`;

                    customFormat.edges.push({
                        id: `edge-${dfNode.id}-${targetNode.id}-${sourceOutputIndex}-${targetInputIndex}`,
                        source_node: dfNode.id.toString(),
                        source_output: sourceOutputName,
                        target_node: targetNode.id.toString(),
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

        const nodeIdMap = new Map<string, number>();
        const dfNodes = dfData.drawflow.Home.data;

        // Step 1: Add Nodes
        for (const customNodeId in customData.nodes) {
            const customNode = customData.nodes[customNodeId];
            const action = actionPalette[customNode.action_id];

            if (!action) {
                console.warn(`Action definition missing for ${customNode.action_id}`);
                continue;
            }

            const numInputs = action.isModular ? (action.inputs || []).length : 1;
            const numOutputs = action.isModular ? (action.outputs || []).length : 1;

            const nodeData = {
                action: { ...action, id: customNode.action_id },
                data: customNode.data || buildDefaultNodeData(action)
            };

            // Construct Drawflow node object
            const dfNodeId = parseInt(customNode.id, 10);
            dfNodes[dfNodeId] = {
                id: dfNodeId,
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
                dfNodes[dfNodeId].inputs[`input_${i}`] = { connections: [] };
            }
            for (let i = 1; i <= Math.max(1, numOutputs); i++) {
                dfNodes[dfNodeId].outputs[`output_${i}`] = { connections: [] };
            }

            nodeIdMap.set(customNode.id, dfNodeId);
        }

        // Step 2: Add Edges
        (customData.edges || []).forEach((edge: any) => {
            const sourceDfId = nodeIdMap.get(edge.source_node);
            const targetDfId = nodeIdMap.get(edge.target_node);

            if (sourceDfId === undefined || targetDfId === undefined) return;

            const sourceNode = dfNodes[sourceDfId];
            const targetNode = dfNodes[targetDfId];
            const sourceAction = sourceNode.data.action;
            const targetAction = targetNode.data.action;

            const sourceOutputIndex = (sourceAction.outputs || []).findIndex((o: any) => o.name === edge.source_output);
            const targetInputIndex = (targetAction.inputs || []).findIndex((i: any) => i.name === edge.target_input);

            if (sourceOutputIndex === -1 && edge.source_output !== 'output') return;
            if (targetInputIndex === -1 && edge.target_input !== 'input') return;

            const sourcePortName = `output_${Math.max(0, sourceOutputIndex) + 1}`;
            const targetPortName = `input_${Math.max(0, targetInputIndex) + 1}`;

            // Bi-directional connection
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
