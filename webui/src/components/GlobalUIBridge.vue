<script setup lang="ts">
import { useMessage, useDialog } from 'naive-ui';
import { useGlobalBridge } from '../composables/useGlobalBridge';
import { useI18n } from '../i18n';

const message = useMessage();
const dialog = useDialog();
const { t } = useI18n();

useGlobalBridge(message, dialog, t);
</script>

<template>
  <!-- This component is renderless and only exists to access the providers -->
</template>
