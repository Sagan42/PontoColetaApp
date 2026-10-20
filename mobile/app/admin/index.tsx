import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  TextField,
  colors,
  radius,
  spacing,
} from '../../src/design-system';
import { MetricsTrend } from '../../src/features/admin/components/MetricsTrend';
import {
  METRIC_PERIODS,
  useUsageMetrics,
  type MetricPeriodDays,
} from '../../src/features/admin/hooks';
import {
  AdminAuthError,
  isSessionValid,
  refreshAdminSession,
  signInAdmin,
  type AdminSession,
} from '../../src/features/admin/auth';
import {
  useCollectionPointReports,
  useHideCollectionPoint,
} from '../../src/features/collection-points/hooks';
import { useAdminFeedback, type FeedbackEntry } from '../../src/features/feedback/hooks';
import { formatDate, formatDateTime } from '../../src/utils/format';

const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

type AdminSection = 'metrics' | 'feedback' | 'reports';

const SECTIONS: { key: AdminSection; label: string }[] = [
  { key: 'metrics', label: 'Métricas' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'reports', label: 'Denúncias' },
];

const REPORT_REASON_LABELS: Record<string, string> = {
  inappropriate: 'Conteúdo impróprio',
  incorrect: 'Informação incorreta',
  closed: 'Local não existe ou fechou',
  duplicate: 'Ponto repetido',
  other: 'Outro motivo',
};

export default function AdminScreen() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [days, setDays] = useState<MetricPeriodDays>(30);
  // A seção vive aqui, acima do painel: o painel desmonta enquanto a sessão é
  // renovada, e quem estava lendo feedback deve voltar para o feedback.
  const [section, setSection] = useState<AdminSection>('metrics');
  const [signedOutMessage, setSignedOutMessage] = useState<string | null>(null);
  const renewalsSinceLastSuccess = useRef(0);

  const signOutAsExpired = useCallback(() => {
    setSession(null);
    setSignedOutMessage(SESSION_EXPIRED_MESSAGE);
  }, []);

  const handleSignedIn = useCallback((signedIn: AdminSession) => {
    renewalsSinceLastSuccess.current = 0;
    setSignedOutMessage(null);
    setSession(signedIn);
  }, []);

  // A 401 means the token the panel holds is no longer accepted, whatever its
  // stated expiry: mark it expired so the renewal below takes over.
  const handleUnauthorized = useCallback(() => {
    setSession((current) => (current === null ? null : { ...current, expiresAt: 0 }));
  }, []);

  const handleAuthorized = useCallback(() => {
    renewalsSinceLastSuccess.current = 0;
  }, []);

  useEffect(() => {
    if (session === null || isSessionValid(session)) return;

    // Renew once per expiry. A renewal that is not followed by an accepted
    // request does not get another turn, so this can never loop.
    if (renewalsSinceLastSuccess.current > 0) {
      signOutAsExpired();
      return;
    }

    renewalsSinceLastSuccess.current += 1;
    let active = true;

    void refreshAdminSession(session).then(
      (renewed) => {
        if (!active) return;
        if (isSessionValid(renewed)) setSession(renewed);
        else signOutAsExpired();
      },
      () => {
        if (active) signOutAsExpired();
      },
    );

    return () => {
      active = false;
    };
  }, [session, signOutAsExpired]);

  if (!isSessionValid(session)) {
    if (session === null) {
      return <AdminLogin onSignedIn={handleSignedIn} message={signedOutMessage} />;
    }

    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <AdminPanel
      session={session}
      section={section}
      onChangeSection={setSection}
      days={days}
      onChangeDays={setDays}
      onUnauthorized={handleUnauthorized}
      onAuthorized={handleAuthorized}
    />
  );
}

function AdminLogin({
  onSignedIn,
  message = null,
}: {
  onSignedIn: (session: AdminSession) => void;
  message?: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(message);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      onSignedIn(await signInAdmin(email.trim(), password));
    } catch (caught) {
      setError(
        caught instanceof AdminAuthError
          ? caught.message
          : 'Não foi possível entrar. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scrollable>
      <View style={styles.loginHeader}>
        <Text variant="title" accessibilityRole="header">
          Acesso administrativo
        </Text>
        <Text variant="body" color="textSecondary">
          Área restrita aos responsáveis pelo PontoColeta.
        </Text>
      </View>

      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        testID="input-admin-email"
      />

      <TextField
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={() => void submit()}
        testID="input-admin-password"
      />

      {error ? (
        <Text variant="body" color="danger" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      <Button
        label="Entrar"
        onPress={() => void submit()}
        loading={submitting}
        testID="button-admin-signin"
      />
    </Screen>
  );
}

/**
 * As duas seções do painel. Cada uma monta a própria consulta, então abrir
 * métricas não busca feedback e vice-versa.
 */
function AdminPanel({
  session,
  section,
  onChangeSection,
  days,
  onChangeDays,
  onUnauthorized,
  onAuthorized,
}: {
  session: AdminSession;
  section: AdminSection;
  onChangeSection: (section: AdminSection) => void;
  days: MetricPeriodDays;
  onChangeDays: (days: MetricPeriodDays) => void;
  onUnauthorized: () => void;
  onAuthorized: () => void;
}) {
  return (
    <Screen scrollable>
      <View style={styles.sectionSelector} accessibilityRole="tablist">
        {SECTIONS.map((option) => {
          const selected = option.key === section;

          return (
            <Pressable
              key={option.key}
              onPress={() => onChangeSection(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={[styles.sectionOption, selected ? styles.sectionOptionSelected : null]}
              testID={`admin-section-${option.key}`}
            >
              <Text variant="bodyStrong" color={selected ? 'primaryDark' : 'textSecondary'}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section === 'metrics' ? (
        <AdminMetrics
          session={session}
          days={days}
          onChangeDays={onChangeDays}
          onUnauthorized={onUnauthorized}
          onAuthorized={onAuthorized}
        />
      ) : section === 'feedback' ? (
        <AdminFeedback
          session={session}
          onUnauthorized={onUnauthorized}
          onAuthorized={onAuthorized}
        />
      ) : (
        <AdminReports
          session={session}
          onUnauthorized={onUnauthorized}
          onAuthorized={onAuthorized}
        />
      )}
    </Screen>
  );
}

function AdminMetrics({
  session,
  days,
  onChangeDays,
  onUnauthorized,
  onAuthorized,
}: {
  session: AdminSession;
  days: MetricPeriodDays;
  onChangeDays: (days: MetricPeriodDays) => void;
  onUnauthorized: () => void;
  onAuthorized: () => void;
}) {
  const metrics = useUsageMetrics(session.idToken, days);

  useEffect(() => {
    if (metrics.isUnauthorized) onUnauthorized();
  }, [metrics.isUnauthorized, onUnauthorized]);

  useEffect(() => {
    if (metrics.isSuccess) onAuthorized();
  }, [metrics.isSuccess, onAuthorized]);

  return (
    <>
      <View style={styles.periodSelector} accessibilityRole="radiogroup">
        {METRIC_PERIODS.map((option) => {
          const selected = option === days;

          return (
            <Pressable
              key={option}
              onPress={() => onChangeDays(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Últimos ${option} dias`}
              style={[styles.periodOption, selected ? styles.periodOptionSelected : null]}
              testID={`period-${option}`}
            >
              <Text variant="bodyStrong" color={selected ? 'primaryDark' : 'textSecondary'}>
                {option} dias
              </Text>
            </Pressable>
          );
        })}
      </View>

      {metrics.isPending ? (
        <LoadingState label="Carregando métricas..." />
      ) : metrics.isError ? (
        <ErrorState
          title="Não foi possível carregar as métricas"
          description="Verifique sua conexão ou entre novamente."
          onRetry={() => void metrics.refetch()}
        />
      ) : metrics.data ? (
        <>
          <Text variant="caption" color="textMuted">
            De {formatDate(metrics.data.period.from)} a {formatDate(metrics.data.period.to)}
          </Text>

          <View style={styles.totals}>
            <TotalCard label="Acessos" value={metrics.data.totals.app_open} />
            <TotalCard label="Consultas" value={metrics.data.totals.searches} />
            <TotalCard label="Pontos cadastrados" value={metrics.data.totals.point_created} />
          </View>

          <Card>
            <MetricsTrend
              title="Acessos por dia"
              series={metrics.data.daily.map((day) => ({
                date: day.date,
                value: day.counters.app_open,
              }))}
            />
          </Card>

          <Card>
            <MetricsTrend
              title="Consultas por dia"
              series={metrics.data.daily.map((day) => ({
                date: day.date,
                value: day.counters.search_address + day.counters.search_material,
              }))}
            />
          </Card>

          <Card>
            <MetricsTrend
              title="Pontos cadastrados por dia"
              series={metrics.data.daily.map((day) => ({
                date: day.date,
                value: day.counters.point_created,
              }))}
            />
          </Card>

          <Card>
            <Text variant="bodyStrong">Detalhe das consultas</Text>
            <Text variant="body" color="textSecondary">
              Por endereço: {metrics.data.totals.search_address}
            </Text>
            <Text variant="body" color="textSecondary">
              Por material: {metrics.data.totals.search_material}
            </Text>
            <Text variant="body" color="textSecondary">
              Detalhes de ponto abertos: {metrics.data.totals.point_viewed}
            </Text>
          </Card>
        </>
      ) : null}
    </>
  );
}

function AdminFeedback({
  session,
  onUnauthorized,
  onAuthorized,
}: {
  session: AdminSession;
  onUnauthorized: () => void;
  onAuthorized: () => void;
}) {
  const feedback = useAdminFeedback(session.idToken);

  useEffect(() => {
    if (feedback.isUnauthorized) onUnauthorized();
  }, [feedback.isUnauthorized, onUnauthorized]);

  useEffect(() => {
    if (feedback.isSuccess) onAuthorized();
  }, [feedback.isSuccess, onAuthorized]);

  if (feedback.isPending) return <LoadingState label="Carregando feedbacks..." />;

  if (feedback.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar os feedbacks"
        description="Verifique sua conexão ou entre novamente."
        onRetry={() => void feedback.refetch()}
      />
    );
  }

  if (feedback.items.length === 0) {
    return (
      <EmptyState
        title="Nenhum feedback ainda"
        description="Quando alguém escrever pelo botão do app, a mensagem aparece aqui."
      />
    );
  }

  return (
    <>
      <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
        {feedback.items.length === 1 ? '1 feedback' : `${feedback.items.length} feedbacks`}
      </Text>

      {feedback.items.map((entry) => (
        <FeedbackCard key={entry.id} entry={entry} />
      ))}

      {feedback.hasNextPage ? (
        <Button
          label="Carregar mais"
          variant="secondary"
          onPress={() => void feedback.fetchNextPage()}
          loading={feedback.isFetchingNextPage}
          testID="button-load-more-feedback"
        />
      ) : null}
    </>
  );
}

function AdminReports({
  session,
  onUnauthorized,
  onAuthorized,
}: {
  session: AdminSession;
  onUnauthorized: () => void;
  onAuthorized: () => void;
}) {
  const reports = useCollectionPointReports(session.idToken);
  const hidePoint = useHideCollectionPoint(session.idToken);

  useEffect(() => {
    if (reports.isUnauthorized) onUnauthorized();
  }, [reports.isUnauthorized, onUnauthorized]);

  useEffect(() => {
    if (reports.isSuccess) onAuthorized();
  }, [reports.isSuccess, onAuthorized]);

  if (reports.isPending) return <LoadingState label="Carregando denúncias..." />;

  if (reports.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar as denúncias"
        description="Verifique sua conexão ou entre novamente."
        onRetry={() => void reports.refetch()}
      />
    );
  }

  if (reports.items.length === 0) {
    return (
      <EmptyState
        title="Nenhuma denúncia"
        description="Quando alguém denunciar um ponto pelo app, ela aparece aqui."
      />
    );
  }

  return (
    <>
      <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
        {reports.items.length === 1 ? '1 denúncia' : `${reports.items.length} denúncias`}
      </Text>

      {reports.items.map((report) => (
        <Card key={report.id} testID={`report-${report.id}`}>
          <View style={styles.feedbackHeader}>
            <Text variant="bodyStrong">{REPORT_REASON_LABELS[report.reason] ?? report.reason}</Text>
            <Text variant="caption" color="textMuted">
              {formatDateTime(report.reportedAt)}
            </Text>
          </View>

          <Text variant="body" color="textSecondary">
            Ponto: {report.pointName}
          </Text>

          {report.details ? (
            <Text variant="body" color="textSecondary">
              {report.details}
            </Text>
          ) : null}

          {/* Denúncia sem ação é denúncia ignorada; a política pede que se aja
              em tempo razoável. Ocultar é idempotente no backend. */}
          <Button
            label={
              hidePoint.isSuccess && hidePoint.variables === report.pointId
                ? 'Ponto ocultado'
                : 'Ocultar ponto'
            }
            variant="secondary"
            disabled={hidePoint.isSuccess && hidePoint.variables === report.pointId}
            loading={hidePoint.isPending && hidePoint.variables === report.pointId}
            onPress={() => hidePoint.mutate(report.pointId)}
            style={styles.reportAction}
            testID={`button-hide-${report.pointId}`}
            accessibilityHint="Tira o ponto de coleta do ar"
          />
        </Card>
      ))}

      {hidePoint.isError ? (
        <Text variant="body" color="danger" accessibilityLiveRegion="assertive">
          Não foi possível ocultar o ponto. Tente novamente.
        </Text>
      ) : null}

      {reports.hasNextPage ? (
        <Button
          label="Carregar mais"
          variant="secondary"
          onPress={() => void reports.fetchNextPage()}
          loading={reports.isFetchingNextPage}
          testID="button-load-more-reports"
        />
      ) : null}
    </>
  );
}

function FeedbackCard({ entry }: { entry: FeedbackEntry }) {
  return (
    <Card testID={`feedback-${entry.id}`}>
      <View style={styles.feedbackHeader}>
        <Text variant="bodyStrong">{entry.author}</Text>
        <Text variant="caption" color="textMuted">
          {formatDateTime(entry.submittedAt)}
        </Text>
      </View>
      <Text variant="body" color="textSecondary">
        {entry.message}
      </Text>
    </Card>
  );
}

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.totalCard} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="display" color="primaryDark">
        {value}
      </Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loginHeader: {
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  sectionSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  sectionOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceMuted,
  },
  sectionOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reportAction: {
    marginTop: spacing.md,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  periodOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  totals: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  totalCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
});
