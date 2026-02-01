import { h, ref, VNodeChild } from 'vue';
import { NInput, NSpace, NText } from 'naive-ui';
import type { MessageApiInjection } from 'naive-ui/es/message/src/MessageProvider';
import type { DialogApiInjection } from 'naive-ui/es/dialog/src/DialogProvider';

export function useGlobalBridge(
    message: MessageApiInjection,
    dialog: DialogApiInjection,
    t: (key: string, args?: any) => string
) {
    // Expose to window for legacy code integration
    const w = window as any;

    // 1. Info / Error Modal
    w.showInfoModal = (msg: string, isError: boolean = false) => {
        // Replace <br> with newlines for cleaner display in Naive UI
        const content = msg.replace(/<br>/g, '\n');

        if (isError) {
            dialog.error({
                title: t('common.error'),
                content,
                positiveText: t('common.ok'),
                maskClosable: false
            });
        } else {
            dialog.info({
                title: t('common.notice'),
                content,
                positiveText: t('common.ok'),
                maskClosable: true
            });
        }
    };

    // 2. Confirm Modal
    w.showConfirmModal = (
        title: string,
        msg: string,
        onConfirm?: () => void,
        onCancel?: () => void
    ) => {
        dialog.warning({
            title: title || t('common.confirm'),
            content: msg.replace(/<br>/g, '\n'),
            positiveText: t('common.confirm'),
            negativeText: t('common.cancel'),
            onPositiveClick: () => {
                onConfirm?.();
            },
            onNegativeClick: () => {
                onCancel?.();
            }
        });
    };

    // 3. Input Modal
    // Note: legacy editor.ts passes extra args sometimes (defaultValue)
    w.showInputModal = (
        title: string,
        msg: string,
        inputType: 'text' | 'textarea' = 'text',
        placeholder: string = '',
        onConfirm?: (value: string) => void,
        onCancel?: () => void,
        extraOptions?: { defaultValue?: string } // Support the hidden 7th arg
    ) => {
        const inputValue = ref(extraOptions?.defaultValue || '');

        dialog.create({
            title: title || t('common.confirm'),
            content: () => h(NSpace, { vertical: true }, {
                default: () => [
                    h(NText, { depth: 1 }, { default: () => msg.replace(/<br>/g, '\n') }),
                    h(NInput, {
                        value: inputValue.value,
                        type: inputType === 'textarea' ? 'textarea' : 'text',
                        placeholder,
                        autosize: inputType === 'textarea' ? { minRows: 3, maxRows: 6 } : undefined,
                        onUpdateValue: (v: string) => { inputValue.value = v; },
                        // Autobocus via direct DOM manipulation or directive is hard here without a custom component,
                        // but NInput usually handles focus nicely.
                    })
                ]
            }),
            positiveText: t('common.confirm'),
            negativeText: t('common.cancel'),
            onPositiveClick: () => {
                onConfirm?.(inputValue.value);
            },
            onNegativeClick: () => {
                onCancel?.();
            }
        });
    };
}
