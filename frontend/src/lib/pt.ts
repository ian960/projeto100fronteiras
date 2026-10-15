import { countPosts } from './format';
// The API answers in English; the people using this site read Portuguese.
//
// Every message the backend can send is listed here, taken from its source
// code. Anything not listed falls through unchanged, so a new backend message
// shows up in English instead of disappearing — that is the cue to add it.
//
// Long term, the cleaner fix is Portuguese messages in the backend itself.

const exact: Record<string, string> = {
  // auth
  'Authentication required.': 'Entre na sua conta para continuar.',
  'Invalid email or password.': 'E-mail ou senha incorretos.',
  'This account is disabled.': 'Esta conta está desativada. Fale com o administrador.',
  'Your session is no longer valid.': 'Sua sessão expirou. Entre de novo.',
  'This email is already registered.': 'Este e-mail já tem conta.',
  'Current password is incorrect.': 'A senha atual está incorreta.',
  'Incorrect password.': 'Senha incorreta.',
  'The new password must be different.': 'A nova senha precisa ser diferente da atual.',
  'Choose a different password.': 'Escolha uma senha diferente.',
  'Too many attempts. Try again later.': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'Too many sign-ups from this address.': 'Muitos cadastros a partir desta conexão. Tente mais tarde.',

  // generic
  'You do not have permission to do that.': 'Você não tem permissão para isso.',
  'Resource not found.': 'Não encontrado.',
  'Invalid request data.': 'Confira os campos destacados.',
  'Provide at least one field to update.': 'Altere pelo menos um campo antes de salvar.',
  'This value is already in use.': 'Este valor já está em uso.',
  'This record is referenced by others.': 'Este item está em uso e não pode ser excluído.',
  'Unexpected error. Please try again.': 'Erro inesperado no servidor. Tente de novo.',

  // not found
  'Post not found.': 'Matéria não encontrada.',
  'Category not found.': 'Categoria não encontrada.',
  'Author not found.': 'Autor não encontrado.',
  'User not found.': 'Usuário não encontrado.',

  // slugs
  'Could not build a slug from this name.': 'Não foi possível criar o endereço a partir deste nome.',
  'Could not build a slug from this title.': 'Não foi possível criar o endereço a partir deste título.',
  'Could not generate a unique slug for this title.': 'Já existem muitas matérias com este título. Ajuste o título ou o endereço.',
  'Use at least one letter or number.': 'Use pelo menos uma letra ou número.',

  // posts
  'This post is not complete yet.': 'A matéria ainda não está completa.',
  'Write a short summary.': 'Escreva um resumo curto.',
  'The body is empty.': 'O texto da matéria está vazio.',
  'News needs a cover image.': 'Notícia precisa de imagem de capa.',
  'News must belong to a category.': 'Escolha uma categoria para a notícia.',
  'Choose a category.': 'Escolha uma categoria.',
  'A column does not belong to a category.': 'Coluna não tem categoria.',
  'Leave this empty for columns.': 'Deixe em branco para colunas.',
  'This post is already published.': 'Esta matéria já está publicada.',
  'This post is not published.': 'Esta matéria não está publicada.',
  'Only a published post can be featured.': 'Só uma matéria publicada pode ir para o destaque.',
  'Only an admin can publish.': 'Só o administrador publica.',
  'Only an admin can unpublish.': 'Só o administrador tira do ar.',
  'Only an admin can set the featured post.': 'Só o administrador escolhe o destaque.',
  'A published post can only be edited by an admin.': 'Depois de publicada, só o administrador edita.',
  'You do not have permission to edit this post.': 'Você não pode editar esta matéria.',
  'You do not have permission to delete this post.': 'Você não pode excluir esta matéria.',
  'You cannot create this type of post.': 'Você não pode criar este tipo de matéria.',
  'You cannot change the category or the byline.': 'Você não pode mudar a categoria nem quem assina.',
  'Only a draft of your own column can be submitted.': 'Só um rascunho da sua coluna pode ser enviado para revisão.',
  'Your account has no author profile.': 'Sua conta ainda não tem perfil de colunista.',

  // video
  'Video URL and provider must be sent together.': 'Informe o vídeo e de onde ele vem.',
  'Required when a video URL is present.': 'Obrigatório quando há vídeo.',
  'Not a valid YouTube link or id.': 'Este não é um link válido do YouTube.',
  'Paste the video link or its 11-character id.': 'Cole o link do vídeo no YouTube.',
  'An uploaded video must be an mp4 URL from the upload endpoint.': 'O vídeo precisa ser um arquivo .mp4 enviado pelo painel.',
  'Upload the file first and send the URL it returns.': 'Envie o arquivo primeiro.',

  // authors and users
  'Only columnists can have a column title.': 'Só colunista tem título de coluna.',
  'Not applicable to a writer.': 'Não se aplica a redator.',
  'This user already has an author profile.': 'Esta pessoa já é colunista.',
  'The admin does not need an author profile to publish news.': 'O administrador não precisa de perfil de colunista.',
  'You cannot deactivate your own account.': 'Você não pode desativar a própria conta.',
  'You cannot remove your own admin role.': 'Você não pode tirar o próprio acesso de administrador.',

  // uploads
  'File uploads are not configured on this server. Set the R2_* variables to enable them.':
    'O envio de arquivos ainda não está configurado neste servidor.',
  'No file received.': 'Nenhum arquivo recebido.',
  'Send a file in the "file" field.': 'Escolha um arquivo.',
  'This file is not a valid image.': 'Este arquivo não é uma imagem válida.',
  'Send a JPEG, PNG, WebP or AVIF image.': 'Envie uma imagem JPEG, PNG, WebP ou AVIF.',
  'This image is too large.': 'Imagem grande demais.',
  'Maximum 8 MB.': 'Máximo de 8 MB.',
  'This image is too small for a cover.': 'Imagem pequena demais para capa.',
};

const patterns: [RegExp, (...groups: string[]) => string][] = [
  [/^A category with the slug "(.+)" already exists\.$/, (slug) => `Já existe uma categoria com o endereço “${slug}”.`],
  [/^An author with the slug "(.+)" already exists\.$/, (slug) => `Já existe um autor com o endereço “${slug}”.`],
  [/^This category has (\d+) post\(s\) and cannot be deleted\. Deactivate it instead\.$/, (n) => `Esta categoria tem ${countPosts(Number(n))} e não pode ser excluída. Desmarque “Visível no site” em vez disso.`],
  [/^This author signs (\d+) post\(s\) and cannot be deleted\. Deactivate them instead\.$/, (n) => `Este autor assina ${countPosts(Number(n))} e não pode ser excluído. Desative-o em vez disso.`],
  [/^Videos must be smaller than (\d+) MB\.$/, (n) => `O vídeo precisa ter menos de ${n} MB.`],
  [/^This file is too large\. Limit is (\d+) MB\.$/, (n) => `Arquivo grande demais. O limite é ${n} MB.`],
  [/^Use an image at least (\d+)px wide\.$/, (n) => `Use uma imagem com pelo menos ${n}px de largura.`],
  [/^Unsupported image type: (.+)$/, (type) => `Tipo de imagem não aceito: ${type}.`],
  [/^Route .+ does not exist\.$/, () => 'Endereço da API não encontrado.'],

  // Zod's own messages, from field validation.
  [/^Too small: expected string to have >=(\d+) characters?$/, (n) => `Use pelo menos ${n} caracteres.`],
  [/^Too big: expected string to have <=(\d+) characters?$/, (n) => `Use no máximo ${n} caracteres.`],
  [/^Invalid email address$/, () => 'E-mail inválido.'],
  [/^Invalid URL$/, () => 'Endereço inválido. Comece com https://'],
  [/^Invalid UUID$/, () => 'Valor inválido.'],
  [/^Invalid input: expected \w+, received undefined$/, () => 'Campo obrigatório.'],
  [/^Invalid input/, () => 'Valor inválido.'],
];

export function pt(message: string | undefined | null): string {
  if (!message) return '';
  const hit = exact[message];
  if (hit) return hit;
  for (const [regex, build] of patterns) {
    const match = message.match(regex);
    if (match) return build(...match.slice(1));
  }
  return message;
}
