import { expect, extractArray, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F15: Correo (Unread Reader & Draft Confirmation)', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F15-T1: Read unread inbox emails in Correo tab matching /api/mail/inbox', async ({
    api,
    troko,
  }) => {
    const inbox = await api.getInbox();
    const messages = extractArray(inbox, 'messages', 'inbox', 'emails');
    expect(messages.length).toBeGreaterThan(0);

    const summary = await api.summary();
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Correo');

    const firstMsg = messages[0];
    await expect(troko.islandLocator).toContainText(
      String(firstMsg.fromName ?? firstMsg.from_name ?? ''),
    );
    await expect(troko.islandLocator).toContainText(String(firstMsg.subject ?? ''));
    expect(Number(summary.unreadEmailsCount)).toBeGreaterThan(0);
  });

  test('F15-T2: Creating a draft reply renders email_draft peek card and NEVER auto-sends', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Correo');

    await page
      .locator('[data-testid="mail-message-item"], li, button')
      .filter({ hasText: /Ana/i })
      .first()
      .click();

    const replyInput = page
      .getByPlaceholder(/Responder|Escribe.*respuesta|Borrador/i)
      .first();
    await replyInput.fill('Mañana confirmo la reunión');
    await page
      .getByRole('button', { name: /Crear borrador|Borrador|Responder/i })
      .first()
      .click();

    await expect(troko.islandLocator).toContainText(/Para:?.*Ana/i);
    await expect(page.getByRole('button', { name: /^Enviar$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Descartar$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Editar$/i }).first()).toBeVisible();

    const inbox = await api.getInbox();
    const drafts = extractArray(inbox, 'drafts');
    const isPendingDraft = (d: Record<string, unknown>) =>
      ['pending_confirmation', 'pending', 'draft'].includes(String(d.status)) &&
      String(d.status) !== 'sent' &&
      (d.sentAt === null || d.sentAt === undefined) &&
      (d.sent_at === null || d.sent_at === undefined);
    expect(drafts.some(isPendingDraft)).toBe(true);
  });

  test('F15-T3: Edit pending email draft via Editar before sending', async ({
    api,
    page,
    troko,
  }) => {
    const inbox = await api.getInbox();
    const msgs = extractArray(inbox, 'messages', 'inbox', 'emails');
    const first = msgs[0];
    await api.createEmailDraft({
      sourceMessageId: String(first.id),
      toName: String(first.fromName ?? first.from_name ?? 'Ana Pérez'),
      toEmail: String(first.fromEmail ?? first.from_email ?? 'ana@ejemplo.com'),
      subject: `Re: ${String(first.subject ?? 'Reunión')}`,
      body: 'Borrador inicial',
    });

    await troko.goto({ completeOnboarding: true, api });
    const editBtn = page.getByRole('button', { name: /^Editar$/i }).first();
    if (!(await editBtn.isVisible().catch(() => false))) {
      await troko.openTab('Correo');
      const pendingDraftRow = page
        .locator('[data-testid="mail-draft-item"], [data-testid="email-draft-peek"], li, div')
        .filter({ hasText: /Borrador inicial|Ana/i })
        .first();
      if (await pendingDraftRow.isVisible().catch(() => false)) {
        await pendingDraftRow.click().catch(() => {});
      }
    }
    await editBtn.click();

    const editor = page.locator('#island textarea, #island input[type="text"]').last();
    await editor.fill('Confirmo para mañana a las 10:00 hs.');
    await page.getByRole('button', { name: /Guardar/i }).first().click();

    await expect(troko.islandLocator).toContainText(
      /Confirmo para mañana a las 10:00 hs\./i,
    );

    const after = await api.getInbox();
    const drafts = extractArray(after, 'drafts');
    expect(
      drafts.some(
        (d) =>
          ['pending_confirmation', 'pending', 'draft'].includes(String(d.status)) &&
          String(d.status) !== 'sent' &&
          (d.sentAt === null || d.sentAt === undefined) &&
          (d.sent_at === null || d.sent_at === undefined) &&
          String(d.body ?? '').includes('Confirmo para mañana a las 10:00 hs.'),
      ),
    ).toBe(true);
  });

  test('F15-T4: Explicit Enviar confirmation dispatches draft and shows success feedback', async ({
    api,
    page,
    troko,
  }) => {
    const inbox = await api.getInbox();
    const msgs = extractArray(inbox, 'messages', 'inbox', 'emails');
    const first = msgs[0];
    const created = await api.createEmailDraft({
      sourceMessageId: String(first.id),
      toName: String(first.fromName ?? first.from_name ?? 'Ana Pérez'),
      toEmail: String(first.fromEmail ?? first.from_email ?? 'ana@ejemplo.com'),
      subject: `Re: ${String(first.subject ?? 'Reunión')}`,
      body: 'Enviando confirmación',
    });
    const draftId = String(
      created.id ?? (created.draft as Record<string, unknown>)?.id,
    );

    await troko.goto({ completeOnboarding: true, api });
    const sendBtn = page.getByRole('button', { name: /^Enviar$/i }).first();
    if (!(await sendBtn.isVisible().catch(() => false))) {
      await troko.openTab('Correo');
      const pendingDraftRow = page
        .locator('[data-testid="mail-draft-item"], [data-testid="email-draft-peek"], li, div')
        .filter({ hasText: /Enviando confirmación|Ana/i })
        .first();
      if (await pendingDraftRow.isVisible().catch(() => false)) {
        await pendingDraftRow.click().catch(() => {});
      }
    }

    const sendPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/mail/drafts/${draftId}/send`) &&
        res.request().method() === 'POST',
    );
    await sendBtn.click();
    expect((await sendPromise).status()).toBe(200);

    await expect
      .poll(async () => troko.getIslandStateAttr())
      .toBe('success');

    await page.reload();
    const after = await api.getInbox();
    const drafts = extractArray(after, 'drafts');
    const sent = drafts.find((d) => String(d.id) === draftId);
    expect(String(sent?.status)).toBe('sent');
    expect(sent?.sentAt ?? sent?.sent_at).toBeTruthy();
  });

  test('F15-T5: Descartar cancels pending draft cleanly without sending', async ({
    api,
    page,
    troko,
  }) => {
    const inbox = await api.getInbox();
    const msgs = extractArray(inbox, 'messages', 'inbox', 'emails');
    const first = msgs[0];
    const created = await api.createEmailDraft({
      sourceMessageId: String(first.id),
      toName: String(first.fromName ?? first.from_name ?? 'Ana Pérez'),
      toEmail: String(first.fromEmail ?? first.from_email ?? 'ana@ejemplo.com'),
      subject: `Re: ${String(first.subject ?? 'Reunión')}`,
      body: 'No enviar este borrador',
    });
    const draftId = String(
      created.id ?? (created.draft as Record<string, unknown>)?.id,
    );

    const before = await api.getInbox();
    const initialDraft = extractArray(before, 'drafts').find(
      (d) => String(d.id) === draftId,
    );
    expect(initialDraft).toBeDefined();
    expect(['pending_confirmation', 'pending', 'draft']).toContain(
      String(initialDraft?.status),
    );
    expect(initialDraft?.sentAt ?? initialDraft?.sent_at ?? null).toBeNull();

    await troko.goto({ completeOnboarding: true, api });
    const discardBtn = page.getByRole('button', { name: /^Descartar$/i }).first();
    if (!(await discardBtn.isVisible().catch(() => false))) {
      await troko.openTab('Correo');
      const pendingDraftRow = page
        .locator('[data-testid="mail-draft-item"], [data-testid="email-draft-peek"], li, div')
        .filter({ hasText: /No enviar este borrador|Ana/i })
        .first();
      if (await pendingDraftRow.isVisible().catch(() => false)) {
        await pendingDraftRow.click().catch(() => {});
      }
    }
    await discardBtn.click();

    await expect
      .poll(async () => {
        const after = await api.getInbox();
        const drafts = extractArray(after, 'drafts');
        const found = drafts.find((d) => String(d.id) === draftId);
        return found && (found.sentAt ?? found.sent_at ?? null) === null
          ? String(found.status)
          : '';
      })
      .toBe('discarded');
  });

  test('F15-T6: Draft reply via Spanish command ("Responde a ...") enforces confirm-before-send gate', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Responde a Ana diciendo que mañana confirmo');

    await expect(page.getByRole('button', { name: /^Enviar$/i }).first()).toBeVisible({
      timeout: 6_000,
    });
    await expect(page.getByRole('button', { name: /^Descartar$/i }).first()).toBeVisible();

    const after = await api.getInbox();
    const drafts = extractArray(after, 'drafts');
    expect(
      drafts.some(
        (d) =>
          ['pending_confirmation', 'pending', 'draft'].includes(String(d.status)) &&
          String(d.status) !== 'sent' &&
          (d.sentAt === null || d.sentAt === undefined) &&
          (d.sent_at === null || d.sent_at === undefined),
      ),
    ).toBe(true);
    expect(drafts.some((d) => String(d.status) === 'sent')).toBe(false);
  });
});
