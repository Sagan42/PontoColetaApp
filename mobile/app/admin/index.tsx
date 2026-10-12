import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
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
import { formatDate } from '../../src/utils/format';

const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

export default function AdminScreen() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [days, setDays] = useState<MetricPeriodDays>(30);
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
    <AdminMetrics
      session={session}
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
    <Screen scrollable>
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
    </Screen>
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
  periodSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
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
