{{- define "choretle.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "choretle.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "choretle.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "choretle.labels" -}}
app.kubernetes.io/name: {{ include "choretle.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "choretle.postgresService" -}}
{{ include "choretle.fullname" . }}-postgres
{{- end -}}

{{- define "choretle.databaseUrl" -}}
{{- if .Values.postgres.enabled -}}
postgres://{{ .Values.postgres.username }}:{{ .Values.postgres.password }}@{{ include "choretle.postgresService" . }}:5432/{{ .Values.postgres.database }}
{{- else -}}
{{ .Values.postgres.url }}
{{- end -}}
{{- end -}}

{{- define "choretle.secretName" -}}
{{- if .Values.existingSecret -}}{{ .Values.existingSecret }}{{- else -}}{{ include "choretle.fullname" . }}{{- end -}}
{{- end -}}
