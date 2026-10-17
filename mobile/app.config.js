/**
 * Configuração dinâmica do Expo.
 *
 * Existe por um motivo só: a chave do Google Maps não pode viver no app.json,
 * porque esse arquivo é versionado e o repositório será público.
 *
 * A chave não é segredo criptográfico — ela vai embutida no APK e qualquer um
 * pode extraí-la. O que de fato a protege é a restrição no Google Cloud por
 * nome de pacote (app.pontocoleta) mais a impressão digital SHA-1 do
 * certificado. Ainda assim ela fica fora do Git: chave exposta em repositório
 * público é varrida por robôs, o Google desativa, e rotacionar depois é pior
 * do que nunca ter commitado.
 *
 * De onde vem o valor:
 *   - localmente, de mobile/.env (que está no .gitignore);
 *   - na build do EAS, da variável de ambiente registrada no projeto.
 *
 * Sem a variável, o manifesto sai sem chave: o app funciona e a aba Mapa
 * aparece cinza. É degradação, não quebra.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '',
      },
    },
  },
});
