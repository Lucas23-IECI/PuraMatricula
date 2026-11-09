#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
PROJECT=puramatricula
SERVICE=puramatricula
CONFIG="$PROJECT_ROOT/docker.env"
ACTION=${1:-check}
BACKUP_FILE=''
USE_IMAGE=0
RESTORE_VOLUME=''
TASK_CONTAINER=''
BACKUP_NEEDS_RESTART=0
PROBE_PID=''
PROBE_OUTPUT=''
ENGINE_VERSION=''
LAST_BACKUP_FILE=''
TMP_EXPORT=''

fail() { printf '%s\n' "$*" >&2; exit 1; }
help() {
    cat <<'HELP'
PuraMatricula: administracion Docker independiente
  ./scripts/docker-colegio.sh init [--use-image]
  ./scripts/docker-colegio.sh start
  ./scripts/docker-colegio.sh check
  ./scripts/docker-colegio.sh backup [/ruta/matricula.dsmbak]
  ./scripts/docker-colegio.sh restore /ruta/matricula.dsmbak
  ./scripts/docker-colegio.sh update
  ./scripts/docker-colegio.sh stop

Las contrasenas se escriben dentro del contenedor, sin argumentos ni archivo
de configuracion. restore verifica un volumen nuevo y conserva el activo.
init --use-image exige la imagen local y no construye ni descarga.
El modo local abre Matricula solo desde el PC servidor (Docker Engine 28+).
Guia: docs/DOCKER-COLEGIO.md
HELP
}
case "$ACTION" in
    help|-h|--help) help; exit 0 ;;
    init|start|check|backup|restore|update|stop) ;;
    *) help; fail 'Comando no reconocido.' ;;
esac
case "$ACTION" in
    init)
        case "${2:-}" in '') ;; --use-image) USE_IMAGE=1 ;; *) fail 'init solo admite --use-image.' ;; esac
        [ "$#" -le 2 ] || fail 'Demasiados argumentos para init.'
        ;;
    backup|restore|update)
        [ "$#" -le 2 ] || fail 'Indique unicamente la ruta de respaldo.'
        [ "${2:-}" != --use-image ] || fail '--use-image solo se admite con init.'
        BACKUP_FILE=${2:-}
        ;;
    *) [ "$#" -le 1 ] || fail 'Este comando no admite argumentos adicionales.' ;;
esac
DOCKER=$(command -v docker) || fail 'Instale Docker y Compose antes de continuar.'

setting() {
    name=$1
    fallback=${2:-}
    case "$name" in
        MATRICULA_DOCKER_MODE) value=${MATRICULA_DOCKER_MODE:-} ;;
        MATRICULA_LOCAL_PORT) value=${MATRICULA_LOCAL_PORT:-} ;;
        MATRICULA_PROXY_NETWORK) value=${MATRICULA_PROXY_NETWORK:-} ;;
        MATRICULA_TLS_CERT_FILE) value=${MATRICULA_TLS_CERT_FILE:-} ;;
        MATRICULA_TLS_KEY_FILE) value=${MATRICULA_TLS_KEY_FILE:-} ;;
        MATRICULA_IMAGE) value=${MATRICULA_IMAGE:-} ;;
        *) fail 'Nombre de configuracion inesperado.' ;;
    esac
    if [ -z "$value" ] && [ -f "$CONFIG" ]; then
        value=$(awk -F= -v name="$name" '$1 ~ ("^" name "[[:space:]]*$") {sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]*$/, ""); value=$0} END {print value}' "$CONFIG")
    fi
    case "$value" in \"*\") value=${value#\"}; value=${value%\"} ;; \'*\') value=${value#\'}; value=${value%\'} ;; esac
    printf '%s\n' "${value:-$fallback}"
}

compose() {
    [ -f "$CONFIG" ] || fail 'Falta docker.env. Ejecute primero ./scripts/docker-colegio.sh init.'
    transport=$(setting MATRICULA_DOCKER_MODE tls)
    case "$transport" in
        local) compose_file=compose.local.yaml ;;
        tls) compose_file=compose.tls.yaml ;;
        proxy) compose_file=compose.yaml ;;
        *) fail 'MATRICULA_DOCKER_MODE debe ser local, tls o proxy.' ;;
    esac
    proxy_network=$(setting MATRICULA_PROXY_NETWORK)
    if [ "$transport" = local ] && [ -n "$proxy_network" ]; then fail 'Quite MATRICULA_PROXY_NETWORK en modo local.'; fi
    if [ "$transport" = proxy ] && [ -n "$proxy_network" ]; then
        set -- compose --project-directory "$PROJECT_ROOT" --env-file "$CONFIG" -f "$PROJECT_ROOT/compose.yaml" -f "$PROJECT_ROOT/compose.proxy.yaml" -p "$PROJECT" "$@"
    else
        set -- compose --project-directory "$PROJECT_ROOT" --env-file "$CONFIG" -f "$PROJECT_ROOT/$compose_file" -p "$PROJECT" "$@"
    fi
    if [ -n "$RESTORE_VOLUME" ]; then env "MATRICULA_DATA_VOLUME=$RESTORE_VOLUME" "$DOCKER" "$@"; else "$DOCKER" "$@"; fi
}

start_service() { compose up -d --no-build --pull never --wait --wait-timeout 90 "$SERVICE"; }

assert_local_image() {
    image_name=$(setting MATRICULA_IMAGE puramatricula:0.2.0)
    case "$image_name" in ''|[!a-zA-Z0-9]*|*[!a-zA-Z0-9._/:@-]*) fail 'MATRICULA_IMAGE no es una referencia de imagen valida.' ;; esac
    if ! image_id=$("$DOCKER" image inspect --format '{{.Id}}' "$image_name"); then fail 'Cargue el tar verificado de la imagen configurada antes de init --use-image.'; fi
    printf '%s\n' "$image_id" | grep -Eq '^sha256:[a-f0-9]{64}$' || fail 'No se pudo comprobar la imagen local configurada.'
    printf '%s\n' 'Se usara la imagen local configurada, sin construir ni descargar.'
}

remove_owned_task() {
    name=$1
    case "$name" in puramatricula-backup-*) ;; *) fail 'Nombre de tarea inesperado.' ;; esac
    if ! matches=$("$DOCKER" ps --all --filter "name=^/$name\$" --format '{{.ID}}'); then printf '%s\n' 'No se pudo consultar el contenedor de tarea.' >&2; return 1; fi
    [ -n "$matches" ] || return 0
    if ! state=$("$DOCKER" inspect --type container --format '{{ index .Config.Labels "com.docker.compose.project" }}|{{ index .Config.Labels "com.docker.compose.oneoff" }}|{{.State.Running}}' "$name"); then printf '%s\n' 'No se pudo validar el contenedor de tarea.' >&2; return 1; fi
    case "$state" in
        "$PROJECT|True|false"|"$PROJECT|true|false") "$DOCKER" rm "$name" ;;
        *) printf '%s\n' 'No se quitara un contenedor ajeno o que sigue ejecutandose.' >&2; return 1 ;;
    esac
}

cleanup() {
    result=$?
    trap - 0
    set +e
    if [ -n "$PROBE_PID" ]; then kill "$PROBE_PID" 2>/dev/null; wait "$PROBE_PID" 2>/dev/null; fi
    if [ -n "$PROBE_OUTPUT" ]; then rm -f -- "$PROBE_OUTPUT"; fi
    if [ -n "$TASK_CONTAINER" ]; then remove_owned_task "$TASK_CONTAINER" || result=1; fi
    if [ "$BACKUP_NEEDS_RESTART" -eq 1 ]; then start_service || result=1; fi
    if [ -n "$TMP_EXPORT" ] && [ -f "$TMP_EXPORT" ]; then printf 'Se conserva la copia cifrada parcial para revision: %s\n' "$TMP_EXPORT" >&2; fi
    exit "$result"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

assert_docker_ready() {
    PROBE_OUTPUT=$(mktemp)
    "$DOCKER" info --format '{{.ServerVersion}}' >"$PROBE_OUTPUT" 2>&1 &
    PROBE_PID=$!
    waited=0
    while kill -0 "$PROBE_PID" 2>/dev/null; do
        if [ "$waited" -ge 10 ]; then
            kill "$PROBE_PID" 2>/dev/null || :
            wait "$PROBE_PID" 2>/dev/null || :
            PROBE_PID=''
            fail 'El motor Docker no respondio en 10 segundos. Inicielo manualmente antes de continuar.'
        fi
        sleep 1
        waited=$((waited + 1))
    done
    if wait "$PROBE_PID"; then PROBE_PID=''; else PROBE_PID=''; fail 'El motor Docker no esta disponible. Compruebe su contexto.'; fi
    IFS= read -r ENGINE_VERSION <"$PROBE_OUTPUT" || :
    rm -f -- "$PROBE_OUTPUT"
    PROBE_OUTPUT=''
}

assert_local_engine() {
    if [ -n "${DOCKER_CONTEXT:-}" ]; then
        endpoint=$("$DOCKER" context inspect --format '{{.Endpoints.docker.Host}}' "$DOCKER_CONTEXT") || fail 'No se pudo verificar el contexto Docker indicado.'
    elif [ -n "${DOCKER_HOST:-}" ]; then
        endpoint=$DOCKER_HOST
    else
        endpoint=$("$DOCKER" context inspect --format '{{.Endpoints.docker.Host}}') || fail 'No se pudo verificar el contexto Docker activo.'
    fi
    endpoint=$(printf '%s' "$endpoint" | tr -d '\r')
    case "$endpoint" in unix:///*|npipe:////./pipe/*) ;; *) fail 'El modo local requiere el motor Docker de este PC (socket Unix o canal local de Windows).' ;; esac
    major=${ENGINE_VERSION%%.*}
    case "$major" in ''|*[!0-9]*) fail 'No se pudo verificar la version del motor Docker; use Docker Engine 28 o posterior en modo local.' ;; esac
    [ "$major" -ge 28 ] || fail 'El modo local requiere Docker Engine 28 o posterior para limitar el acceso a 127.0.0.1.'
}

local_port() {
    configured_port=$(setting MATRICULA_LOCAL_PORT 4319)
    printf '%s\n' "$configured_port" | grep -Eq '^[1-9][0-9]{3,4}$' || fail 'MATRICULA_LOCAL_PORT debe ser un numero entre 1024 y 65535.'
    [ "$configured_port" -ge 1024 ] && [ "$configured_port" -le 65535 ] || fail 'MATRICULA_LOCAL_PORT debe estar entre 1024 y 65535.'
    printf '%s\n' "$configured_port"
}

show_local_address() {
    if [ "$(setting MATRICULA_DOCKER_MODE tls)" = local ]; then
        printf 'Abra http://127.0.0.1:%s en el navegador del PC servidor.\n' "$(local_port)"
    fi
}

check_local_address() {
    if ! command -v curl >/dev/null 2>&1; then
        printf '%s\n' 'curl no esta disponible; compruebe el acceso en el navegador de este PC.'
        return
    fi
    address="http://127.0.0.1:$(local_port)/api/health"
    result=$(curl --noproxy '*' --silent --show-error --fail --max-time 5 "$address") || fail 'El puerto local no responde desde este PC.'
    case "$result" in *'"ok":true'*'"application":"matricula"'*'"demo":false'*) ;; *) fail 'El puerto local no responde como Matricula en modo escolar.' ;; esac
    printf '%s\n' 'Acceso desde este PC comprobado.'
}

new_configuration() {
    if [ -e "$CONFIG" ]; then printf '%s\n' 'Se conserva docker.env existente; no se reemplazan sus valores.'; return; fi
    printf 'Modo: local (solo PC servidor), tls o proxy HTTPS [local]: '
    IFS= read -r transport
    transport=${transport:-local}
    case "$transport" in local|tls|proxy) ;; *) fail 'Seleccione local, tls o proxy.' ;; esac
    if [ "$transport" = local ]; then
        assert_local_engine
        default_port=4319
        printf 'Puerto HTTP para el PC servidor [4319]: '
    else
        printf 'Origen HTTPS usado por Secretaria; TLS propio ej. https://10.0.0.25:4433: '
        IFS= read -r public_origin
        printf '%s\n' "$public_origin" | grep -Eq '^https://(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?)(:[0-9]{1,5})?/?$' || fail 'Use un origen HTTPS sin usuario, contrasena, ruta, consulta ni fragmento.'
        public_origin=${public_origin%/}
        if [ "$transport" = tls ]; then default_port=4433; printf 'Puerto HTTPS para la red del colegio [4433]: '; else default_port=4319; printf 'Puerto HTTP solo en 127.0.0.1 para el proxy [4319]: '; fi
    fi
    IFS= read -r selected_port
    selected_port=${selected_port:-$default_port}
    printf '%s\n' "$selected_port" | grep -Eq '^[1-9][0-9]{3,4}$' || fail 'El puerto debe ser un numero entre 1024 y 65535.'
    [ "$selected_port" -ge 1024 ] && [ "$selected_port" -le 65535 ] || fail 'Use un puerto entre 1024 y 65535.'
    local_bind_port=4319
    http_port=4319
    tls_port=4433
    if [ "$transport" = local ]; then
        local_bind_port=$selected_port
        public_origin="http://127.0.0.1:$selected_port"
    elif [ "$transport" = tls ]; then
        authority=${public_origin#https://}
        case "$authority" in \[*\]) origin_port=443 ;; *:*) origin_port=${authority##*:} ;; *) origin_port=443 ;; esac
        [ "$origin_port" -eq "$selected_port" ] || fail 'En modo tls el origen HTTPS debe indicar el puerto publicado, por ejemplo :4433.'
        tls_port=$selected_port
    else http_port=$selected_port; fi
    (
        set -C
        umask 077
        {
            printf '%s\n' '# Configuracion propia de PuraMatricula. No agregue contrasenas.'
            printf 'MATRICULA_DOCKER_MODE=%s\n' "$transport"
            printf 'MATRICULA_PUBLIC_ORIGIN=%s\n' "$public_origin"
            printf 'MATRICULA_LOCAL_PORT=%s\n' "$local_bind_port"
            printf 'MATRICULA_HTTP_PORT=%s\n' "$http_port"
            printf 'MATRICULA_TLS_PORT=%s\n' "$tls_port"
            printf '%s\n' 'MATRICULA_TLS_BIND=0.0.0.0' 'MATRICULA_TLS_CERT_FILE=./certificados/matricula.crt' 'MATRICULA_TLS_KEY_FILE=./certificados/matricula.key'
            printf '%s\n' 'MATRICULA_IMAGE=puramatricula:0.2.0' 'MATRICULA_DATA_VOLUME=puramatricula_data' 'MATRICULA_NETWORK_NAME=puramatricula_private'
        } >"$CONFIG"
    )
    printf '%s\n' 'docker.env creado sin contrasenas. Consulte la guia del modo elegido.'
}

assert_transport_files() {
    [ "$(setting MATRICULA_DOCKER_MODE tls)" = tls ] || return 0
    for name in MATRICULA_TLS_CERT_FILE MATRICULA_TLS_KEY_FILE; do
        path=$(setting "$name")
        [ -n "$path" ] || fail "Falta $name en docker.env."
        case "$path" in /*) ;; *) path="$PROJECT_ROOT/$path" ;; esac
        [ -f "$path" ] || fail "Falta el archivo propio configurado en $name. Prepare certificados propios, nunca los de Asistencia."
    done
}

unique_token() { od -An -N8 -tx1 /dev/urandom | tr -d ' \n'; }

backup_data() {
    assert_local_image
    token=$(unique_token)
    filename="matricula-$(date -u +%Y%m%dT%H%M%SZ)-$token.dsmbak"
    destination=${BACKUP_FILE:-"$PROJECT_ROOT/backups/$filename"}
    case "$destination" in *.dsmbak) ;; *) fail 'El destino debe terminar en .dsmbak.' ;; esac
    [ ! -e "$destination" ] || fail 'El archivo de destino ya existe; no se sobrescribira.'
    destination_parent=$(dirname -- "$destination")
    mkdir -p -- "$destination_parent"
    destination_parent=$(CDPATH= cd -- "$destination_parent" && pwd -P)
    destination="$destination_parent/$(basename -- "$destination")"
    TMP_EXPORT="$destination_parent/.partial-$token.dsmbak"
    TASK_CONTAINER="puramatricula-backup-$token"
    if ! running_services=$(compose ps --status running --services); then fail 'No se pudo comprobar el estado de Matricula; respaldo cancelado.'; fi
    if printf '%s\n' "$running_services" | grep -Fxq "$SERVICE"; then
        BACKUP_NEEDS_RESTART=1
        compose stop --timeout 30 "$SERVICE"
    fi
    compose run --pull never --name "$TASK_CONTAINER" --no-deps "$SERVICE" node scripts/docker-maintenance.mjs backup "/data/matricula/backups/$filename"
    "$DOCKER" cp "$TASK_CONTAINER:/data/matricula/backups/$filename" "$TMP_EXPORT"
    chmod 600 "$TMP_EXPORT"
    mv -n -- "$TMP_EXPORT" "$destination"
    [ ! -e "$TMP_EXPORT" ] || fail 'El destino aparecio durante la copia; se conserva el archivo parcial cifrado.'
    TMP_EXPORT=''
    LAST_BACKUP_FILE=$destination
    printf 'Respaldo cifrado copiado a: %s\n' "$destination"
    remove_owned_task "$TASK_CONTAINER"
    TASK_CONTAINER=''
    if [ "$BACKUP_NEEDS_RESTART" -eq 1 ]; then BACKUP_NEEDS_RESTART=0; start_service; fi
}

restore_data() {
    [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ] || fail 'Indique un archivo de respaldo cifrado existente.'
    case "$BACKUP_FILE" in *.dsmbak) ;; *) fail 'Seleccione un archivo .dsmbak.' ;; esac
    assert_local_image
    source_parent=$(CDPATH= cd -- "$(dirname -- "$BACKUP_FILE")" && pwd -P)
    source="$source_parent/$(basename -- "$BACKUP_FILE")"
    RESTORE_VOLUME="puramatricula_restore_$(date -u +%Y%m%dT%H%M%SZ | tr 'A-Z' 'a-z')_$(unique_token)"
    "$DOCKER" volume create --label cl.dsm.puramatricula.purpose=restore-check --label "com.docker.compose.project=$PROJECT" --label com.docker.compose.volume=matricula-data "$RESTORE_VOLUME"
    compose run --pull never --rm --no-deps -v "$source:/restore-input.dsmbak:ro" "$SERVICE" node scripts/docker-maintenance.mjs restore /restore-input.dsmbak /data/matricula
    printf 'Restauracion verificada en volumen nuevo: %s\n' "$RESTORE_VOLUME"
    printf '%s\n' 'El volumen activo no cambio. Conserve el nombre y siga la prueba aislada de la guia.'
    RESTORE_VOLUME=''
}

assert_docker_ready
if [ "$ACTION" = init ]; then new_configuration; fi
if [ "$ACTION" != stop ]; then
    if [ "$(setting MATRICULA_DOCKER_MODE tls)" = local ]; then
        assert_local_engine
        local_port >/dev/null
    fi
    assert_transport_files
fi
compose config --quiet
case "$ACTION" in
    init)
        if [ "$USE_IMAGE" -eq 1 ]; then assert_local_image; else compose build "$SERVICE"; fi
        compose run --pull never --rm --no-deps "$SERVICE" node scripts/docker-init.mjs
        compose run --pull never --rm --no-deps "$SERVICE" node scripts/docker-start.mjs --check
        start_service
        show_local_address
        ;;
    start) start_service; show_local_address ;;
    check)
        compose ps
        if ! running_services=$(compose ps --status running --services); then fail 'No se pudo comprobar el estado de Matricula.'; fi
        printf '%s\n' "$running_services" | grep -Fxq "$SERVICE" || fail 'Matricula no esta ejecutandose. Use start despues de inicializar.'
        compose exec -T "$SERVICE" node scripts/docker-start.mjs --check
        compose exec -T "$SERVICE" node scripts/docker-healthcheck.mjs
        if [ "$(setting MATRICULA_DOCKER_MODE tls)" = local ]; then
            printf '%s\n' 'Salud interna comprobada.'
            check_local_address
            show_local_address
        else
            printf '%s\n' 'Salud interna comprobada. Pruebe tambien HTTPS e ingreso desde Secretaria.'
        fi
        ;;
    backup) backup_data ;;
    restore) restore_data ;;
    update)
        backup_data
        if ! images=$(compose images --quiet "$SERVICE"); then fail 'No se pudo comprobar la imagen anterior; actualizacion cancelada.'; fi
        image=$(printf '%s\n' "$images" | sed -n '1p')
        if [ -n "$image" ]; then
            rollback="puramatricula:antes-$(date -u +%Y%m%dT%H%M%SZ | tr 'A-Z' 'a-z')"
            "$DOCKER" image tag "$image" "$rollback"
            printf 'Imagen anterior conservada como %s\n' "$rollback"
        fi
        compose build "$SERVICE"
        start_service
        printf 'Actualizacion comprobada. Conserve el respaldo: %s\n' "$LAST_BACKUP_FILE"
        ;;
    stop) compose stop --timeout 30 "$SERVICE" ;;
esac
