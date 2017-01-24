(function ($) {
    'use strict';

    $.pocketlists = {
        $loading: $('<i class="icon16 loading">'),
        defaults: {
            isAdmin: false
        },
        options: {},
        updateAppCounter: function (count) {
            var self = this;

            var setIcon = function (count) {
                count = parseInt(count, 10) || '';
                var counter = self.$app_menu_pocket.find('.indicator');
                var sidebar_todo_counter = self.$core_sidebar.find('[data-pl-sidebar="todo"] .count');
                if (!counter.length) {
                    self.$app_menu_pocket.find('a').append('<span class="indicator" style="display:none;">');
                    counter = self.$app_menu_pocket.find('.indicator');
                }
                if (!sidebar_todo_counter.length) {
                    sidebar_todo_counter = $('<span class="count indicator red" style="display:none;">');
                    self.$core_sidebar.find('[data-pl-sidebar="todo"]').prepend(sidebar_todo_counter);
                }
                counter.add(sidebar_todo_counter).text(count);
                if (count) {
                    counter.add(sidebar_todo_counter).show();
                } else {
                    counter.add(sidebar_todo_counter).hide();
                }
            };

            if (count) {
                setIcon(count);
            } else {
                $.get('?module=json&action=appCount', function (r) {
                    if (r.status === 'ok') {
                        setIcon(r.data);
                    }
                }, 'json');
            }
        },
        scrollToTop: function (speed, offset) {
            if ($('body').scrollTop() > offset) {
                $('html,body').animate({scrollTop: offset + 'px'}, speed);
            }
        },
        highlightSidebar: function($li) {
            var self = this;

            var $all_li = self.$core_sidebar.find('li');
            if ($li) {
                $all_li.removeClass('selected');
                $li.addClass('selected');
            } else {
                var hash = $.pocketlists_routing.getHash(),
                    $a = self.$core_sidebar.find('a[href="' + hash + '"]');

                if (hash) {
                    $all_li.removeClass('selected');
                }
                if ($a.length) { // first find full match
                    $a.closest('li').addClass('selected');
                } else { // more complex hash
                    hash = hash.split("/");
                    if (hash[1]) {
                        self.$core_sidebar.find('a[href^="' + hash[0] + '/' + hash[1] + '"]').first().closest('li').addClass('selected');
                    }
                }
            }
        },
        setTitle: function(title) {
            var self = this;
            var $h1 = $('#wa-app .content h1').first();
            if ($h1.length && !title) {
                title = $h1.contents().filter(function () {
                    return this.nodeType == 3 && this.nodeValue.trim().length > 0;
                })[0].nodeValue.trim()
            }
            if (title) {
                $('title').html(title + " &mdash; " + self.options.account_name);
            }
        },
        stickyDetailsSidebar: function() {
            var $list = $('#pl-list-content');
            if ($list.length) {
                var list_top_offset = $list.offset().top,
                    _viewport_top_offset = $(window).scrollTop(),
                    _window_height = $(window).height(),
                    $el = $('.pl-details');

                if ($el.find('.fields form').height() > _window_height) {
                    return;
                }

                if (_viewport_top_offset > list_top_offset) {
                    $el.addClass('sticky');
                    var _viewport_bottom_offset = $(document).height() - _window_height - _viewport_top_offset;

                    $el.css({
                        bottom: Math.max(0, 16 - _viewport_bottom_offset),
                        right: 16
                    });
                } else {
                    $el.removeClass('sticky').css('right', 0);
                }
            }
        },
        resizeTextarea: function ($textarea) {
            if ($textarea.is(':visible')) {
                $textarea.css('height', 'auto');
                $textarea.css('height', ($textarea.get(0).scrollHeight - parseInt($textarea.css('padding-top')) - parseInt($textarea.css('padding-bottom'))) + 'px');
            }
        },
        initNotice: function(wrapper_selector) {
            var $wrapper = $(wrapper_selector);
            if (!$.storage.get('pocketlists/notice/' + wrapper_selector)) {
                $wrapper.show().one('click', '.close', function() {
                    $.storage.set('pocketlists/notice/' + wrapper_selector, 1);
                    $wrapper.slideUp();
                });
            } else {
                $wrapper.remove();
            }
        },
        reloadSidebar: function () {
            var self = this;

            $.get("?module=backend&action=sidebar", function (result) {
                $('#pl-sidebar-core').html(result);
                self.highlightSidebar();
            });
        },
        sortLists: function() {
            var self = this;
            if (!self.options.isAdmin) {
                return;
            }

            var $lists_wrapper = self.$core_sidebar.find('[data-pl-sidebar-block="lists"]');
            $lists_wrapper.sortable({
                item: '[data-pl-list-id]',
                distance: 5,
                placeholder: 'pl-list-placeholder',
                tolerance: 'pointer',
                start: function(e, ui ){
                    ui.placeholder.height(ui.helper.outerHeight());
                },
                stop: function (event, ui) {
                    var getLists = function () {
                        var data = [];
                        $lists_wrapper.find('[data-pl-list-id]').each(function (i) {
                            var $this = $(this);
                                // color = $this.attr('class').match(/pl-(.*)/);
                            data.push({
                                id: $this.data('pl-list-id'),
                                sort: i
                                // color: color[1]
                            });
                        });
                        return data;
                    };

                    var updateSort = function () {
                        $.post(
                            '?module=list&action=sort',
                            {
                                data: getLists()
                            },
                            function (r) {
                                if (r.status === 'ok') {
                                } else {
                                    alert(r.errors);
                                }
                            },
                            'json'
                        );
                    };

                    updateSort();
                }
            });
        },
        init: function (o) {
            $.pocketlists_routing.init();

            var self = this;
            self.$app_menu_pocket = $('#wa-app-pocketlists');
            self.$core_sidebar = $('#pl-sidebar-core');
            self.options = $.extend({}, self.defaults, o);

            self.highlightSidebar();

            self.sortLists();

            $('#wa-app').on('click', '[data-pl-scroll-to-top] a', function () {
                self.scrollToTop(0, 80);
            });
        }
    };
}(jQuery));